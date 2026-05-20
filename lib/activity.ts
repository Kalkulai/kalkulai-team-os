import type { TeamMember, CalendarEvent, HubSpotCall } from '@/types';
import { getActiveBranches, getRecentlyOpenedPRs, type MergedPR, getCommitsByAuthorSince } from './github';
import { getCompletedIssuesSince, getCreatedIssuesSince } from './linear';
import { getCallsThisWeek } from './hubspot';
import { getSalesLogsSince } from './supabase';
import { getRecentlyCompletedSteps, getRecentCounterActivity } from './kpis';
import type { ActivityDay, ActivityEvent } from '@/components/dashboard/ActivityTimeline';
import { format, isSameDay, isYesterday, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';

const HERMES_LABELS = new Set(['hermes', 'from-hermes']);
const CALL_SESSION_GAP_MS = 30 * 60_000;

/**
 * Calls within `gapMs` of each other (default 30 min) are merged into one
 * "calling session" — keeps the timeline readable when a sales user logs 20+
 * cold calls in a row. A solo call passes through as a session of count=1.
 * Output is sorted ascending by session start; callers re-sort if needed.
 */
export interface CallSession {
  start: Date;
  end: Date;
  count: number;
  totalDurationMs: number;
}

export function clusterCalls(
  calls: HubSpotCall[],
  gapMs: number = CALL_SESSION_GAP_MS,
): CallSession[] {
  const dated = calls
    .map((c) => ({ t: parseISO(c.timestamp), duration: c.duration }))
    .filter((c) => !Number.isNaN(c.t.getTime()))
    .sort((a, b) => a.t.getTime() - b.t.getTime());
  const out: CallSession[] = [];
  for (const c of dated) {
    const last = out[out.length - 1];
    if (last && c.t.getTime() - last.end.getTime() <= gapMs) {
      last.end = c.t;
      last.count += 1;
      last.totalDurationMs += c.duration;
    } else {
      out.push({ start: c.t, end: c.t, count: 1, totalDurationMs: c.duration });
    }
  }
  return out;
}

function callSessionToEvent(session: CallSession): ActivityEvent {
  const startTime = format(session.start, 'HH:mm');
  if (session.count === 1) {
    const minutes = Math.max(1, Math.round(session.totalDurationMs / 60_000));
    return {
      time: startTime,
      text: `Call (${minutes} min)`,
      source: 'HubSpot',
      kind: 'call',
    };
  }
  const endTime = format(session.end, 'HH:mm');
  const range = startTime === endTime ? startTime : `${startTime}–${endTime}`;
  return {
    time: startTime,
    text: `${session.count} Calls · ${range}`,
    source: 'HubSpot',
    kind: 'call',
  };
}

function salesLogLabel(type: string): string {
  switch (type) {
    case 'cold-call': return 'Cold Call';
    case 'follow-up': return 'Follow-up';
    case 'demo':      return 'Demo';
    default:          return type.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

export async function buildActivityFeed(
  member: TeamMember,
  todayMeetings: CalendarEvent[],
  recentlyMerged?: MergedPR[],
): Promise<ActivityDay[]> {
  const now = new Date();

  const todayEvents: ActivityEvent[] = [];
  const yesterdayEvents: ActivityEvent[] = [];

  // Termine heute: laufende → "läuft seit X min", beendete → "beendet"
  for (const m of todayMeetings) {
    try {
      // All-day events (birthdays, holidays) have no real start/end time —
      // render them as a static once-per-day entry, never as "läuft seit X min".
      if (m.allDay) {
        todayEvents.push({
          time: '—',
          text: m.summary,
          kind: 'standup',
          source: 'Calendar · Ganztägig',
        });
        continue;
      }
      const start = parseISO(m.start);
      const end = parseISO(m.end);
      if (start > now) continue; // zukünftig: gehört nicht in den Activity-Stream
      const isRunning = end > now;
      const refTime = isRunning ? start : end;
      const time = format(refTime, 'HH:mm');
      const text = isRunning
        ? `${m.summary} läuft seit ${Math.max(1, Math.round((now.getTime() - start.getTime()) / 60_000))} min`
        : `${m.summary} beendet`;
      todayEvents.push({
        time,
        text,
        kind: m.isSalesCall ? 'call' : 'standup',
        source: m.isSalesCall ? 'Calendar · Sales' : 'Calendar',
      });
    } catch {
      // ignore parse errors
    }
  }

  // Eigene Commits (heute/gestern) — repo-agnostic via GitHub-Search-API,
  // damit jede Aktivität auf JEDEM Repo des Members angezeigt wird, nicht
  // nur die konfigurierten REPOS.
  if (member.github_username) {
    try {
      const sinceIso = new Date(now.getTime() - 2 * 86_400_000).toISOString();
      const commits = await getCommitsByAuthorSince(
        member.github_username,
        sinceIso,
        50,
        member.github_token,
      );
      console.log(`[activity/github] ${member.github_username}: ${commits.length} commits since ${sinceIso}`);
      let added = 0;
      for (const c of commits) {
        const dt = parseISO(c.date);
        if (!Number.isFinite(dt.getTime())) continue;
        const time = format(dt, 'HH:mm');
        const repoShort = c.repo.split('/').pop() ?? c.repo;
        const ev: ActivityEvent = {
          time,
          text: c.message.length > 70 ? `${c.message.slice(0, 70)}…` : c.message,
          code: repoShort,
          source: 'GitHub',
          kind: 'commit',
        };
        if (isSameDay(dt, now)) { todayEvents.push(ev); added++; }
        else if (isYesterday(dt)) { yesterdayEvents.push(ev); added++; }
      }
      console.log(`[activity/github] ${member.github_username}: ${added}/${commits.length} commits fit today/yesterday window`);
    } catch (err) {
      console.error('[activity/github] commit-search failed:', err instanceof Error ? err.message : String(err));
    }
  } else {
    console.log(`[activity/github] member has no github_username (${member.name})`);
  }

  // Linear-Issues die dieser Member heute/gestern completed hat → ok Events
  if (member.linear_user_id) {
    try {
      const sinceISO = new Date(now.getTime() - 2 * 86_400_000).toISOString();
      const completed = await getCompletedIssuesSince(member.linear_user_id, sinceISO);
      for (const c of completed) {
        try {
          const dt = parseISO(c.completedAt);
          const time = format(dt, 'HH:mm');
          const ev: ActivityEvent = {
            time,
            text: `${c.identifier} erledigt`,
            code: c.title,
            source: 'Linear',
            kind: 'ok',
          };
          if (isSameDay(dt, now)) todayEvents.push(ev);
          else if (isYesterday(dt)) yesterdayEvents.push(ev);
        } catch {
          // ignore parse errors
        }
      }
    } catch {
      // Linear-Token fehlt o.ä. → silent skip
    }
  }

  // HubSpot-Calls (für sales-Members) → call Events (heute/gestern). Calls in
  // einer Sitzung (Abstand < 30 min) werden zu einem Eintrag zusammengefasst,
  // damit eine Cold-Call-Stunde nicht die ganze Timeline überflutet. Single
  // calls bleiben als „Call (X min)" sichtbar.
  if (member.hubspot_owner_id && member.role === 'sales') {
    try {
      const calls = await getCallsThisWeek(member.hubspot_owner_id);
      const todayCalls: HubSpotCall[] = [];
      const yesterdayCalls: HubSpotCall[] = [];
      for (const c of calls) {
        try {
          const dt = parseISO(c.timestamp);
          if (isSameDay(dt, now)) todayCalls.push(c);
          else if (isYesterday(dt)) yesterdayCalls.push(c);
        } catch {
          // ignore parse errors
        }
      }
      for (const session of clusterCalls(todayCalls)) {
        todayEvents.push(callSessionToEvent(session));
      }
      for (const session of clusterCalls(yesterdayCalls)) {
        yesterdayEvents.push(callSessionToEvent(session));
      }
    } catch {
      // HubSpot-Token fehlt o.ä. → silent skip
    }
  }

  // Linear-Issues die dieser Member heute/gestern erstellt hat (oder Hermes für ihn) → hermes/ok Events
  if (member.linear_user_id) {
    try {
      const sinceISO = new Date(now.getTime() - 2 * 86_400_000).toISOString();
      const created = await getCreatedIssuesSince(member.linear_user_id, sinceISO);
      for (const c of created) {
        try {
          const dt = parseISO(c.createdAt);
          if (!isSameDay(dt, now) && !isYesterday(dt)) continue;
          const time = format(dt, 'HH:mm');
          const isHermes = c.labels.some((l) => HERMES_LABELS.has(l.toLowerCase()));
          const ev: ActivityEvent = {
            time,
            text: isHermes ? `${c.identifier} via Hermes` : `${c.identifier} erstellt`,
            code: c.title,
            source: isHermes ? 'Hermes' : 'Linear',
            kind: isHermes ? 'hermes' : 'create',
          };
          if (isSameDay(dt, now)) todayEvents.push(ev);
          else yesterdayEvents.push(ev);
        } catch {
          // ignore parse errors
        }
      }
    } catch {
      // Linear-Token fehlt o.ä. → silent skip
    }
  }

  // PRs die dieser Member heute/gestern geöffnet hat → branch Events
  if (member.github_username) {
    try {
      const opened = await getRecentlyOpenedPRs(2);
      for (const pr of opened) {
        if (pr.author !== member.github_username) continue;
        try {
          const dt = parseISO(pr.createdAt);
          if (!isSameDay(dt, now) && !isYesterday(dt)) continue;
          const time = format(dt, 'HH:mm');
          const repoShort = pr.repo.split('/').pop() ?? pr.repo;
          const ev: ActivityEvent = {
            time,
            text: `PR #${pr.number} geöffnet`,
            code: pr.headRef,
            source: repoShort,
            kind: 'pr-open',
          };
          if (isSameDay(dt, now)) todayEvents.push(ev);
          else yesterdayEvents.push(ev);
        } catch {
          // ignore parse errors
        }
      }
    } catch {
      // GitHub-Token fehlt o.ä. → silent skip
    }
  }

  // Counter-Increments heute/gestern → counter Events (Tagessumme pro KPI)
  try {
    const yesterday = new Date(now.getTime() - 86_400_000);
    const sinceDay = format(yesterday, 'yyyy-MM-dd');
    const todayDay = format(now, 'yyyy-MM-dd');
    const yesterdayDay = sinceDay;
    const counterEvents = await getRecentCounterActivity(member.id, sinceDay);
    for (const c of counterEvents) {
      const unitLabel = c.unit?.trim() ? c.unit : c.kpi_name;
      const ev: ActivityEvent = {
        time: '—',
        text: `+${c.delta} ${unitLabel}`,
        code: c.unit ? c.kpi_name : undefined,
        source: 'KPIs',
        kind: 'counter',
      };
      if (c.day === todayDay) todayEvents.push(ev);
      else if (c.day === yesterdayDay) yesterdayEvents.push(ev);
    }
  } catch {
    // kpi_history fehlt o.ä. → silent skip
  }

  // Projekt-Teilschritte heute/gestern als erledigt markiert → ok Events
  try {
    const sinceISO = new Date(now.getTime() - 2 * 86_400_000).toISOString();
    const steps = await getRecentlyCompletedSteps(member.id, sinceISO);
    for (const s of steps) {
      try {
        const dt = parseISO(s.completed_at);
        if (!isSameDay(dt, now) && !isYesterday(dt)) continue;
        const time = format(dt, 'HH:mm');
        const code = s.parent_name ? `${s.parent_name}: ${s.name}` : s.name;
        const ev: ActivityEvent = {
          time,
          text: 'Teilschritt erledigt',
          code,
          source: 'Projects',
          kind: 'step-done',
        };
        if (isSameDay(dt, now)) todayEvents.push(ev);
        else yesterdayEvents.push(ev);
      } catch {
        // ignore parse errors
      }
    }
  } catch {
    // Supabase-Error → silent skip
  }

  // Manuell geloggte Sales-Aktionen (FAB-Button, nur sales-role, nur Demos —
  // Cold Calls / Follow-ups wären zu hochfrequent und würden die Timeline überfluten)
  // → call Events
  if (member.role === 'sales') try {
    const sinceISO = new Date(now.getTime() - 2 * 86_400_000).toISOString();
    const logs = await getSalesLogsSince(member.id, sinceISO);
    for (const log of logs) {
      if (log.type !== 'demo') continue;
      try {
        const dt = parseISO(log.logged_at);
        if (!isSameDay(dt, now) && !isYesterday(dt)) continue;
        const time = format(dt, 'HH:mm');
        const ev: ActivityEvent = {
          time,
          text: salesLogLabel(log.type),
          source: 'Manual',
          kind: 'call',
        };
        if (isSameDay(dt, now)) todayEvents.push(ev);
        else yesterdayEvents.push(ev);
      } catch {
        // ignore parse errors
      }
    }
  } catch {
    // Supabase-Error → silent skip
  }

  // PRs die dieser Member heute/gestern gemerged hat → ok Events
  if (recentlyMerged && member.github_username) {
    for (const pr of recentlyMerged) {
      if (pr.merger !== member.github_username) continue;
      try {
        const dt = parseISO(pr.mergedAt);
        const time = format(dt, 'HH:mm');
        const repoShort = pr.repo.split('/').pop() ?? pr.repo;
        const ev: ActivityEvent = {
          time,
          text: pr.isBot ? `Dependency-Update #${pr.number} gemerged` : `PR #${pr.number} gemerged`,
          code: pr.headRef,
          source: pr.isBot ? `${repoShort} · Dependabot` : repoShort,
          kind: pr.isBot ? 'dep' : 'merge',
        };
        if (isSameDay(dt, now)) todayEvents.push(ev);
        else if (isYesterday(dt)) yesterdayEvents.push(ev);
      } catch {
        // ignore parse errors
      }
    }
  }

  // Sortierung: jüngste zuerst (HH:mm desc)
  todayEvents.sort((a, b) => b.time.localeCompare(a.time));
  yesterdayEvents.sort((a, b) => b.time.localeCompare(a.time));

  const days: ActivityDay[] = [
    {
      label: 'Heute',
      date: format(now, 'd. MMM', { locale: de }),
      events: todayEvents,
    },
  ];
  if (yesterdayEvents.length > 0) {
    const y = new Date(now.getTime() - 86_400_000);
    days.push({
      label: 'Gestern',
      date: format(y, 'd. MMM', { locale: de }),
      events: yesterdayEvents,
    });
  }
  return days;
}
