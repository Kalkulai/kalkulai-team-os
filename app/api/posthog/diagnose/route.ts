import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { readFileSync } from 'fs';
import { join } from 'path';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * KAL-148 — read-only PostHog diagnose probe.
 *
 *   GET /api/posthog/diagnose
 *
 * Three questions in one shot:
 *   1. Comes ANY event in at all? (event count last 24h/7d/30d)
 *   2. Which identified users exist?
 *   3. Which event names exist (basis for feature-tracking)?
 *   + per-pilot event count
 *
 * Pure read against PostHog's HogQL + Person search. No writes.
 */

interface Rule {
  slug: string;
  name: string;
  searchTerms: string[];
  owner?: string;
}

interface HogQLResult {
  results: Array<Array<string | number | null>>;
}

interface PersonResult {
  results: Array<{
    uuid?: string;
    last_seen_at?: string | null;
    properties?: Record<string, unknown> | null;
  }>;
}

async function ph<T>(host: string, path: string, key: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${host}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`PostHog ${res.status} ${path}: ${(await res.text()).slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

async function hogql(host: string, projectId: string, key: string, query: string): Promise<HogQLResult['results']> {
  // Try the env-id endpoint first (PostHog v2 split), fall back to project-id.
  const body = JSON.stringify({ query: { kind: 'HogQLQuery', query } });
  try {
    const json = await ph<HogQLResult>(host, `/api/environments/${projectId}/query`, key, { method: 'POST', body });
    return json.results;
  } catch {
    const json = await ph<HogQLResult>(host, `/api/projects/${projectId}/query`, key, { method: 'POST', body });
    return json.results;
  }
}

async function searchPersons(host: string, projectId: string, key: string, term: string): Promise<PersonResult['results']> {
  const qs = `search=${encodeURIComponent(term)}&limit=50`;
  try {
    return (await ph<PersonResult>(host, `/api/environments/${projectId}/persons?${qs}`, key)).results;
  } catch {
    return (await ph<PersonResult>(host, `/api/projects/${projectId}/persons?${qs}`, key)).results;
  }
}

function loadRules(): Rule[] {
  try {
    const raw = readFileSync(join(process.cwd(), 'pilot-activity-rules.kalkulai.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((r): Rule => ({
        slug: String(r?.slug ?? ''),
        name: String(r?.name ?? ''),
        owner: typeof r?.owner === 'string' ? r.owner : undefined,
        searchTerms: Array.isArray(r?.searchTerms) ? r.searchTerms.map(String) : [],
      }))
      .filter((r) => r.slug && r.searchTerms.length > 0);
  } catch {
    return [];
  }
}

interface DiagnoseInput {
  total7d: number;
  identifiedShare: number;
  anonymousShare: number;
  pilotsWithMatches: number;
  pilotsWithEvents: number;
  totalPilots: number;
}

function diagnose(d: DiagnoseInput): {
  verdict: 'snippet-not-firing' | 'identify-broken' | 'pilots-not-using' | 'partial-usage' | 'healthy';
  reasoning: string;
} {
  if (d.total7d === 0) {
    return {
      verdict: 'snippet-not-firing',
      reasoning:
        'Zero events org-wide in 7d. PostHog snippet is not running anywhere (or wrong project key). Verify NEXT_PUBLIC_POSTHOG_KEY on the kalkulai frontend.',
    };
  }
  if (d.identifiedShare === 0 && d.anonymousShare > 0) {
    return {
      verdict: 'identify-broken',
      reasoning: `${d.anonymousShare} anonymous events but 0 identified. posthog.identify(email) is never called. Add identify on login/signup in the kalkulai frontend.`,
    };
  }
  if (d.pilotsWithMatches === 0 && d.identifiedShare > 0) {
    return {
      verdict: 'identify-broken',
      reasoning: `${d.identifiedShare} identified events but none match any pilot rule. Either (a) pilots login with a different email than what we tracked, or (b) identify fires with a non-email distinct_id. Check what distinct_id is being used.`,
    };
  }
  if (d.pilotsWithMatches > 0 && d.pilotsWithEvents === 0) {
    return {
      verdict: 'pilots-not-using',
      reasoning: `${d.pilotsWithMatches}/${d.totalPilots} pilots are identified in PostHog but 0 events in last 7d. They signed up but stopped using the app.`,
    };
  }
  if (d.pilotsWithEvents < d.totalPilots) {
    return {
      verdict: 'partial-usage',
      reasoning: `${d.pilotsWithEvents}/${d.totalPilots} pilots active. Mix of usage + drop-off.`,
    };
  }
  return { verdict: 'healthy', reasoning: 'All pilots active in last 7d.' };
}

export async function GET(req: NextRequest) {
  if (!requireApiAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const host = (process.env.POSTHOG_HOST || 'https://eu.posthog.com').replace(/\/$/, '');
  const projectId = process.env.POSTHOG_PROJECT_ID;
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY || process.env.POSTHOG_API_KEY;

  if (!projectId || !apiKey) {
    return NextResponse.json(
      {
        error: 'POSTHOG_PROJECT_ID + POSTHOG_PERSONAL_API_KEY required',
        host,
        hasProjectId: !!projectId,
        hasApiKey: !!apiKey,
      },
      { status: 500 },
    );
  }

  const rules = loadRules();

  // 1. Event volume — three rolling windows
  const [r24h, r7d, r30d] = await Promise.all([
    hogql(host, projectId, apiKey, 'select count() from events where timestamp > now() - interval 24 hour'),
    hogql(host, projectId, apiKey, 'select count() from events where timestamp > now() - interval 7 day'),
    hogql(host, projectId, apiKey, 'select count() from events where timestamp > now() - interval 30 day'),
  ]);

  // 2. Identified persons last 7d
  const identified = await hogql(
    host,
    projectId,
    apiKey,
    `select person.properties.email as email, max(timestamp) as last_seen, count() as events
     from events
     where timestamp > now() - interval 7 day
       and person.properties.email is not null
     group by email
     order by last_seen desc
     limit 50`,
  );

  // 3. Top event names — basis for feature-tracking gap analysis
  const topEvents = await hogql(
    host,
    projectId,
    apiKey,
    `select event, count() as c from events
     where timestamp > now() - interval 7 day
     group by event order by c desc limit 30`,
  );

  // 4. Anonymous vs identified split
  const split = await hogql(
    host,
    projectId,
    apiKey,
    `select
       countIf(person.properties.email is not null) as identified,
       countIf(person.properties.email is null) as anonymous
     from events where timestamp > now() - interval 7 day`,
  );

  // 5. Per-pilot probe
  const pilots = [] as Array<{
    slug: string;
    name: string;
    owner: string | null;
    matchedEmails: string[];
    lastSeenAt: string | null;
    eventCount7d: number;
    note: string;
  }>;

  for (const rule of rules) {
    const matched = new Set<string>();
    let lastSeen: string | null = null;
    for (const term of rule.searchTerms) {
      const persons = await searchPersons(host, projectId, apiKey, term);
      for (const p of persons) {
        const email = typeof p.properties?.email === 'string' ? p.properties.email.toLowerCase() : null;
        if (email) matched.add(email);
        if (p.last_seen_at && (!lastSeen || p.last_seen_at > lastSeen)) lastSeen = p.last_seen_at;
      }
    }
    let eventCount = 0;
    let note = '';
    if (matched.size === 0) {
      note = 'no matching person in PostHog (identify never fired with these emails)';
    } else {
      const list = [...matched].map((e) => `'${e.replace(/'/g, "''")}'`).join(',');
      const cnt = await hogql(
        host,
        projectId,
        apiKey,
        `select count() from events
         where timestamp > now() - interval 7 day
           and person.properties.email in (${list})`,
      );
      eventCount = Number(cnt[0]?.[0] ?? 0);
      note = eventCount === 0 ? 'identified, 0 events in 7d (signed up but never returned)' : `${eventCount} events`;
    }
    pilots.push({
      slug: rule.slug,
      name: rule.name,
      owner: rule.owner ?? null,
      matchedEmails: [...matched],
      lastSeenAt: lastSeen,
      eventCount7d: eventCount,
      note,
    });
  }

  const totalsByCategory = {
    total7d: Number(r7d[0]?.[0] ?? 0),
    identifiedShare: Number(split[0]?.[0] ?? 0),
    anonymousShare: Number(split[0]?.[1] ?? 0),
    pilotsWithMatches: pilots.filter((p) => p.matchedEmails.length > 0).length,
    pilotsWithEvents: pilots.filter((p) => p.eventCount7d > 0).length,
    totalPilots: pilots.length,
  };

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    posthog: { host, projectId },
    event_volume: {
      last_24h: Number(r24h[0]?.[0] ?? 0),
      last_7d: Number(r7d[0]?.[0] ?? 0),
      last_30d: Number(r30d[0]?.[0] ?? 0),
    },
    event_split_7d: {
      identified: totalsByCategory.identifiedShare,
      anonymous: totalsByCategory.anonymousShare,
    },
    identified_persons_7d: identified.map((row) => ({
      email: row[0],
      last_seen: row[1],
      events: Number(row[2] ?? 0),
    })),
    top_event_names_7d: topEvents.map((row) => ({
      event: row[0],
      count: Number(row[1] ?? 0),
    })),
    pilots,
    diagnosis: diagnose(totalsByCategory),
  });
}
