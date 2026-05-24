import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { getCompletedIssuesSince, getCreatedIssuesSince } from '@/lib/linear';
import { getCommitsByAuthorSince, getMergedPRsByAuthorSince } from '@/lib/github';
import type { TeamMember } from '@/types';

export const maxDuration = 60;

interface SalesLog {
  id: string;
  user_id: string;
  type: string;
  note: string | null;
  logged_at: string;
}

interface KpiHistoryRow {
  kpi_id: string;
  day: string;
  actual: number;
  kpis: { name: string; unit: string; user_id: string } | null;
}

interface ClaudeSessionRow {
  session_id: string;
  linear_identifier: string | null;
  title: string | null;
  host: string | null;
  started_at: string;
  last_seen_at: string;
  task_history: { linear_id: string; action: string; at: string }[] | null;
}

export async function GET(req: NextRequest) {
  if (!requireApiAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const dateParam = req.nextUrl.searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
  }

  const sinceISO = `${dateParam}T00:00:00.000Z`;
  const untilISO = `${dateParam}T23:59:59.999Z`;

  const { data: member, error } = await supabaseAdmin
    .from('team_members')
    .select('*')
    .eq('id', userId)
    .single<TeamMember>();

  if (error || !member) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }

  const [
    linearCompleted,
    linearCreated,
    ghCommits,
    ghMergedPRs,
    salesLogsRes,
    kpiHistoryRes,
    claudeSessionsRes,
  ] = await Promise.all([
    member.linear_user_id
      ? getCompletedIssuesSince(member.linear_user_id, sinceISO).catch(() => [])
      : Promise.resolve([]),
    member.linear_user_id
      ? getCreatedIssuesSince(member.linear_user_id, sinceISO).catch(() => [])
      : Promise.resolve([]),
    member.github_username
      ? getCommitsByAuthorSince(member.github_username, sinceISO, 50, member.github_token).catch(() => [])
      : Promise.resolve([]),
    member.github_username
      ? getMergedPRsByAuthorSince(member.github_username, sinceISO, 30, member.github_token).catch(() => [])
      : Promise.resolve([]),
    supabaseAdmin
      .from('sales_logs')
      .select('id, user_id, type, note, logged_at')
      .eq('user_id', userId)
      .gte('logged_at', sinceISO)
      .lte('logged_at', untilISO)
      .order('logged_at', { ascending: true }),
    supabaseAdmin
      .from('kpi_history')
      .select('kpi_id, day, actual, kpis!inner(name, unit, user_id)')
      .eq('kpis.user_id', userId)
      .eq('day', dateParam),
    supabaseAdmin
      .from('claude_sessions')
      .select('session_id, linear_identifier, title, host, started_at, last_seen_at, task_history')
      .eq('user_id', userId)
      .gte('last_seen_at', sinceISO)
      .lte('last_seen_at', untilISO)
      .order('last_seen_at', { ascending: true }),
  ]);

  const salesLogs = (salesLogsRes.data ?? []) as SalesLog[];
  const kpiHistory = (kpiHistoryRes.data ?? []) as unknown as KpiHistoryRow[];
  const claudeSessions = (claudeSessionsRes.data ?? []) as ClaudeSessionRow[];

  // Tickets actively pinned during the day — both currently-pinned identifiers
  // and any ticket that appears in any session's task_history (set/hold/done
  // transitions within today). Used by the daily-recap to render a "Heute
  // aktiv bearbeitet" bucket beyond just closed tickets. See KAL-133.
  const activeIdentifiers = new Set<string>();
  for (const s of claudeSessions) {
    if (s.linear_identifier) activeIdentifiers.add(s.linear_identifier);
    for (const entry of s.task_history ?? []) {
      if (!entry?.linear_id || !entry.at) continue;
      if (entry.at >= sinceISO && entry.at <= untilISO) {
        activeIdentifiers.add(entry.linear_id);
      }
    }
  }

  return NextResponse.json({
    date: dateParam,
    window: { since: sinceISO, until: untilISO },
    member: {
      id: member.id,
      name: member.name,
      role: member.role,
    },
    sources: {
      linear: {
        completed: linearCompleted,
        created: linearCreated,
      },
      github: {
        commits: ghCommits,
        merged_prs: ghMergedPRs,
      },
      supabase: {
        sales_logs: salesLogs,
        kpi_history: kpiHistory.map((r) => ({
          kpi_id: r.kpi_id,
          day: r.day,
          actual: r.actual,
          name: r.kpis?.name ?? null,
          unit: r.kpis?.unit ?? null,
        })),
        claude_sessions: claudeSessions,
        session_active_identifiers: Array.from(activeIdentifiers).sort(),
      },
    },
  });
}
