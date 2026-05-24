import { differenceInHours, formatDistanceToNowStrict, parseISO } from 'date-fns';

export interface PilotActivityRule {
  slug: string;
  name: string;
  owner?: string;
  searchTerms: string[];
  staleAfterHours?: number;
}

interface PosthogPerson {
  id?: string | number;
  uuid?: string;
  created_at?: string;
  last_seen_at?: string;
  distinct_ids?: string[];
  properties?: Record<string, unknown> | null;
}

export interface PilotPersonSummary {
  id: string;
  email: string | null;
  name: string | null;
  last_seen_at: string | null;
  status: 'active' | 'recent' | 'stale' | 'unknown';
  last_seen_label: string;
}

export interface PilotEventCount {
  event: string;
  count: number;
}

export interface PilotActivitySummary {
  slug: string;
  name: string;
  owner: string | null;
  tracked_users: number;
  active_24h: number;
  active_7d: number;
  last_seen_at: string | null;
  last_seen_label: string;
  stale_after_hours: number;
  status: 'healthy' | 'warning' | 'stale' | 'unconfigured';
  needs_action: boolean;
  people: PilotPersonSummary[];
  /** Per-day event counts for the last 14 days (oldest → newest). Empty when
   *  no matched persons or PostHog query failed. Powers the inline sparkline
   *  on the dashboard pilot cards. */
  daily_counts_14d: number[];
  /** Top custom + autocapture event names for this pilot, last 30 days.
   *  Internal PostHog events ($identify, $set, $feature_flag_called) are
   *  filtered out so the list is meaningful at a glance. */
  top_events_30d: PilotEventCount[];
  /** Top URL paths visited by this pilot, last 30 days. */
  top_paths_30d: PilotEventCount[];
}

const DEFAULT_HOST = 'https://eu.posthog.com';
const DEFAULT_STALE_HOURS = 72;

function getConfig(): { host: string; projectId: string | null; apiKey: string | null; rules: PilotActivityRule[] } {
  const rawRules = process.env.PILOT_ACTIVITY_RULES_JSON?.trim();
  let rules: PilotActivityRule[] = [];
  if (rawRules) {
    try {
      const parsed = JSON.parse(rawRules);
      if (Array.isArray(parsed)) {
        rules = parsed
          .filter((row) => row && typeof row === 'object')
          .map((row) => {
            const value = row as Record<string, unknown>;
            return {
              slug: String(value.slug ?? '').trim(),
              name: String(value.name ?? '').trim(),
              owner: typeof value.owner === 'string' ? value.owner : undefined,
              staleAfterHours:
                typeof value.staleAfterHours === 'number' && Number.isFinite(value.staleAfterHours)
                  ? value.staleAfterHours
                  : undefined,
              searchTerms: Array.isArray(value.searchTerms)
                ? value.searchTerms.map((term) => String(term).trim()).filter(Boolean)
                : [],
            } satisfies PilotActivityRule;
          })
          .filter((rule) => rule.slug && rule.name && rule.searchTerms.length > 0);
      }
    } catch (error) {
      console.warn('Invalid PILOT_ACTIVITY_RULES_JSON', error);
    }
  }

  return {
    host: (process.env.POSTHOG_HOST || DEFAULT_HOST).replace(/\/$/, ''),
    projectId: process.env.POSTHOG_PROJECT_ID || process.env.POSTHOG_ENVIRONMENT_ID || null,
    apiKey: process.env.POSTHOG_PERSONAL_API_KEY || process.env.POSTHOG_API_KEY || null,
    rules,
  };
}

function normalize(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function personEmail(person: PosthogPerson): string | null {
  const props = person.properties ?? {};
  return normalize(props.email) || normalize(props.$email);
}

function personName(person: PosthogPerson): string | null {
  const props = person.properties ?? {};
  return normalize(props.name) || normalize(props.$name);
}

function personId(person: PosthogPerson): string {
  return String(person.uuid ?? person.id ?? personEmail(person) ?? Math.random());
}

async function fetchPersons(host: string, projectId: string, apiKey: string, search: string): Promise<PosthogPerson[]> {
  const paths = [`/api/environments/${projectId}/persons`, `/api/projects/${projectId}/persons`];
  for (const path of paths) {
    const url = new URL(`${host}${path}`);
    url.searchParams.set('search', search);
    url.searchParams.set('limit', '100');

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (res.status === 404) continue;
    if (!res.ok) {
      throw new Error(`PostHog persons lookup failed (${res.status}) for ${path}`);
    }

    const json = (await res.json()) as { results?: PosthogPerson[] };
    return json.results ?? [];
  }

  return [];
}

async function hogql(
  host: string,
  projectId: string,
  apiKey: string,
  query: string,
): Promise<Array<Array<string | number | null>>> {
  const body = JSON.stringify({ query: { kind: 'HogQLQuery', query } });
  const paths = [`/api/environments/${projectId}/query`, `/api/projects/${projectId}/query`];
  for (const path of paths) {
    const res = await fetch(`${host}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body,
      cache: 'no-store',
    });
    if (res.status === 404) continue;
    if (!res.ok) throw new Error(`PostHog HogQL ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as { results?: Array<Array<string | number | null>> };
    return json.results ?? [];
  }
  return [];
}

interface PilotEventDetail {
  daily_counts_14d: number[];
  top_events_30d: PilotEventCount[];
  top_paths_30d: PilotEventCount[];
}

const EMPTY_PILOT_DETAIL: PilotEventDetail = {
  daily_counts_14d: [],
  top_events_30d: [],
  top_paths_30d: [],
};

const SYSTEM_EVENTS = new Set([
  '$identify',
  '$set',
  '$feature_flag_called',
  '$groupidentify',
  '$create_alias',
]);

/** Per-pilot HogQL drilldown — sparkline + top events + top paths. Pulls
 *  events filtered to the union of matched person emails so we attribute
 *  to the right pilot. Returns empty detail when no emails match (the
 *  caller's `tracked_users === 0` branch). */
async function getPilotEventDetail(
  host: string,
  projectId: string,
  apiKey: string,
  matchedEmails: string[],
): Promise<PilotEventDetail> {
  if (matchedEmails.length === 0) return EMPTY_PILOT_DETAIL;
  const emailList = matchedEmails
    .map((e) => `'${e.replace(/'/g, "''")}'`)
    .join(',');
  const where = `where timestamp > now() - interval 30 day
                   and person.properties.email in (${emailList})`;

  // Three parallel queries — same auth, same project, batched at the network layer.
  const [dailyRaw, topEventsRaw, topPathsRaw] = await Promise.all([
    hogql(host, projectId, apiKey,
      `select toDate(timestamp) as day, count() as c
       from events
       where timestamp > now() - interval 14 day
         and person.properties.email in (${emailList})
       group by day order by day asc`,
    ).catch(() => []),
    hogql(host, projectId, apiKey,
      `select event, count() as c from events
       ${where}
       group by event order by c desc limit 6`,
    ).catch(() => []),
    hogql(host, projectId, apiKey,
      `select properties.$pathname as path, count() as c from events
       ${where}
         and event = '$pageview'
         and properties.$pathname is not null
       group by path order by c desc limit 5`,
    ).catch(() => []),
  ]);

  // Backfill daily counts so the sparkline always has exactly 14 slots.
  const countsByDay = new Map<string, number>();
  for (const row of dailyRaw) {
    countsByDay.set(String(row[0]), Number(row[1] ?? 0));
  }
  const dailyCounts14d: number[] = [];
  const now = new Date();
  for (let i = 13; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    dailyCounts14d.push(countsByDay.get(key) ?? 0);
  }

  const topEvents = topEventsRaw
    .map((row): PilotEventCount => ({ event: String(row[0] ?? ''), count: Number(row[1] ?? 0) }))
    .filter((r) => r.event && !SYSTEM_EVENTS.has(r.event))
    .slice(0, 5);

  const topPaths = topPathsRaw
    .map((row): PilotEventCount => ({ event: String(row[0] ?? ''), count: Number(row[1] ?? 0) }))
    .filter((r) => r.event);

  return {
    daily_counts_14d: dailyCounts14d,
    top_events_30d: topEvents,
    top_paths_30d: topPaths,
  };
}

function buildLastSeenLabel(lastSeenAt: string | null): string {
  if (!lastSeenAt) return 'nie';
  try {
    return `${formatDistanceToNowStrict(parseISO(lastSeenAt), { addSuffix: true })}`;
  } catch {
    return lastSeenAt;
  }
}

function summarizePerson(person: PosthogPerson, staleAfterHours: number): PilotPersonSummary {
  const lastSeenAt = normalize(person.last_seen_at);
  const hours = lastSeenAt ? differenceInHours(new Date(), parseISO(lastSeenAt)) : null;
  let status: PilotPersonSummary['status'] = 'unknown';
  if (hours != null && Number.isFinite(hours)) {
    if (hours <= 24) status = 'active';
    else if (hours <= staleAfterHours) status = 'recent';
    else status = 'stale';
  }

  return {
    id: personId(person),
    email: personEmail(person),
    name: personName(person),
    last_seen_at: lastSeenAt,
    status,
    last_seen_label: buildLastSeenLabel(lastSeenAt),
  };
}

function sortPeople(people: PilotPersonSummary[]): PilotPersonSummary[] {
  return [...people].sort((a, b) => {
    if (!a.last_seen_at && !b.last_seen_at) return 0;
    if (!a.last_seen_at) return 1;
    if (!b.last_seen_at) return -1;
    return b.last_seen_at.localeCompare(a.last_seen_at);
  });
}

export async function getPilotActivity(): Promise<PilotActivitySummary[]> {
  const { host, projectId, apiKey, rules } = getConfig();
  if (!projectId || !apiKey || rules.length === 0) {
    return rules.map((rule) => ({
      slug: rule.slug,
      name: rule.name,
      owner: rule.owner ?? null,
      tracked_users: 0,
      active_24h: 0,
      active_7d: 0,
      last_seen_at: null,
      last_seen_label: 'nicht konfiguriert',
      stale_after_hours: rule.staleAfterHours ?? DEFAULT_STALE_HOURS,
      status: 'unconfigured',
      needs_action: false,
      people: [],
      daily_counts_14d: [],
      top_events_30d: [],
      top_paths_30d: [],
    }));
  }

  const results: PilotActivitySummary[] = [];

  for (const rule of rules) {
    const staleAfterHours = rule.staleAfterHours ?? DEFAULT_STALE_HOURS;
    const byId = new Map<string, PilotPersonSummary>();

    for (const term of rule.searchTerms) {
      const persons = await fetchPersons(host, projectId, apiKey, term);
      for (const person of persons) {
        const summary = summarizePerson(person, staleAfterHours);
        const key = summary.email || summary.id;
        const prev = byId.get(key);
        if (!prev || (summary.last_seen_at && (!prev.last_seen_at || summary.last_seen_at > prev.last_seen_at))) {
          byId.set(key, summary);
        }
      }
    }

    const people = sortPeople([...byId.values()]);
    const active24h = people.filter((person) => person.status === 'active').length;
    const active7d = people.filter((person) => {
      if (!person.last_seen_at) return false;
      try {
        return differenceInHours(new Date(), parseISO(person.last_seen_at)) <= 24 * 7;
      } catch {
        return false;
      }
    }).length;
    const lastSeenAt = people[0]?.last_seen_at ?? null;
    const trackedUsers = people.length;

    let status: PilotActivitySummary['status'] = 'healthy';
    if (trackedUsers === 0 || !lastSeenAt) status = 'stale';
    else {
      const hours = differenceInHours(new Date(), parseISO(lastSeenAt));
      if (hours > staleAfterHours) status = 'stale';
      else if (hours > 24 || active24h === 0) status = 'warning';
    }

    const matchedEmails = people
      .map((p) => p.email)
      .filter((e): e is string => !!e)
      .map((e) => e.toLowerCase());
    const detail = await getPilotEventDetail(host, projectId, apiKey, matchedEmails).catch(
      () => EMPTY_PILOT_DETAIL,
    );

    results.push({
      slug: rule.slug,
      name: rule.name,
      owner: rule.owner ?? null,
      tracked_users: trackedUsers,
      active_24h: active24h,
      active_7d: active7d,
      last_seen_at: lastSeenAt,
      last_seen_label: buildLastSeenLabel(lastSeenAt),
      stale_after_hours: staleAfterHours,
      status,
      needs_action: status === 'warning' || status === 'stale',
      people: people.slice(0, 5),
      daily_counts_14d: detail.daily_counts_14d,
      top_events_30d: detail.top_events_30d,
      top_paths_30d: detail.top_paths_30d,
    });
  }

  return results.sort((a, b) => {
    const rank = (value: PilotActivitySummary['status']) =>
      value === 'stale' ? 0 : value === 'warning' ? 1 : value === 'healthy' ? 2 : 3;
    return rank(a.status) - rank(b.status);
  });
}
