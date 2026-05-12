import type { TeamMember, CalendarEvent } from '@/types';
import { getActiveBranches, getRecentlyOpenedPRs, type MergedPR } from './github';
import { getCompletedIssuesSince, getCreatedIssuesSince } from './linear';
import { getCallsThisWeek } from './hubspot';
import { getSalesLogsSince } from './supabase';
import { getRecentlyCompletedSteps, getRecentCounterActivity } from './kpis';
import type { ActivityDay, ActivityEvent } from '@/components/dashboard/ActivityTimeline';
import { format, isSameDay, isYesterday, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';

const HERMES_LABELS = new Set(['hermes', 'from-hermes']);

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

  // Eigene aktive Branches → commit Events (heute/gestern)
  if (member.github_username) {
    try {
      const branches = await getActiveBranches();
      for (const b of branches) {
        if (b.authorLogin !== member.github_username || !b.lastCommitDate) continue;
        const dt = parseISO(b.lastCommitDate);
        const time = format(dt, 'HH:mm');
        const ev: ActivityEvent = {
          time,
          text: 'Letzter Commit auf',
          code: b.name,
          source: 'GitHub',
          kind: 'commit',
        };
        if (isSameDay(dt, now)) todayEvents.push(ev);
        else if (isYesterday(dt)) yesterdayEvents.push(ev);
      }
    } catch {
      // GitHub-Token fehlt o.ä. → silent skip; Empty-State im UI
    }
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

  // HubSpot-Calls (für sales-Members) → call Events (heute/gestern)
  if (member.hubspot_owner_id && member.role === 'sales') {
    try {
      const calls = await getCallsThisWeek(member.hubspot_owner_id);
      for (const c of calls) {
        try {
          const dt = parseISO(c.timestamp);
          if (!isSameDay(dt, now) && !isYesterday(dt)) continue;
          const time = format(dt, 'HH:mm');
          const minutes = Math.max(1, Math.round(c.duration / 60_000));
          const ev: ActivityEvent = {
            time,
            text: `Call (${minutes} min)`,
            source: 'HubSpot',
            kind: 'call',
          };
          if (isSameDay(dt, now)) todayEvents.push(ev);
          else yesterdayEvents.push(ev);
        } catch {
          // ignore parse errors
        }
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
