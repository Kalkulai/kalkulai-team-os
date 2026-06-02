import { supabaseAdmin } from '@/lib/supabase';
import {
  cleanupStaleAgentSessions,
  clearAgentSession,
  listLiveAgentSessions,
  touchAgentSession,
  upsertAgentSession,
} from '@/lib/agent-sessions';
import type {
  AgentRuntime,
  AgentSessionStatus,
  ClaudeActiveSessionSnapshot,
  ClaudeSession,
  TaskHistoryEntry,
} from '@/types';

/**
 * Claude Code session tracker — the data layer behind the Kanban "active task"
 * badge. One row in `claude_sessions` per running Claude Code session
 * (~/.claude/task-sessions/<session_id>.json). The session-pre-tool hook
 * pushes upserts here so the dashboard can show which human-host pair is
 * currently working on which Linear ticket. Stale rows (>10 min since
 * last_seen_at) are swept by a cron — see migration 015.
 */

const STALE_THRESHOLD_MIN = 10;
const SNAPSHOT_WINDOW_MIN = 60;
const CLEANUP_THRESHOLD_HOURS = 24;
const BASE_SELECT_COLUMNS = 'session_id, user_id, linear_identifier, title, host, started_at, last_seen_at, task_history';
const SELECT_COLUMNS = 'session_id, user_id, linear_identifier, title, host, cwd, started_at, last_seen_at, task_history';

export interface UpsertSessionInput {
  session_id: string;
  user_id: string;
  linear_identifier?: string | null;
  title?: string | null;
  host?: string | null;
  cwd?: string | null;
  runtime?: AgentRuntime | null;
  status?: AgentSessionStatus | null;
  workstream?: string | null;
  branch?: string | null;
  worktree_path?: string | null;
  terminal_session_id?: string | null;
  last_decision?: string | null;
  current_state?: string | null;
  next_decision?: string | null;
  /** Optional snapshot of the local task_history array. When provided, the
   *  server overwrites the persisted history wholesale — safe because the
   *  local state file is the authoritative source per session (one writer,
   *  see KAL-133). */
  task_history?: TaskHistoryEntry[];
}

export async function upsertClaudeSession(input: UpsertSessionInput): Promise<void> {
  await upsertAgentSession({ ...input, runtime: input.runtime ?? 'claude' });
}

export async function touchClaudeSession(session_id: string): Promise<void> {
  await touchAgentSession(session_id);
}

export async function clearClaudeSession(session_id: string): Promise<void> {
  await clearAgentSession(session_id);
}

/** Lookup which active sessions touch which Linear identifiers. Used by the
 * Kanban board to render the 🤖 badge on cards that have a live Claude
 * working on them. Filters out stale (>10 min) rows.
 *
 * Returns a Map keyed by Linear identifier (e.g. `KAL-89`) so the Kanban
 * render can do O(1) `sessionsByIdentifier.get(card.identifier)`. */
export async function getActiveSessionsByIdentifier(
  identifiers: string[]
): Promise<Map<string, ClaudeSession[]>> {
  if (identifiers.length === 0) return new Map();
  const sinceIso = new Date(Date.now() - STALE_THRESHOLD_MIN * 60_000).toISOString();
  const { data, error } = await readClaudeSessions((q) =>
    q.in('linear_identifier', identifiers).gt('last_seen_at', sinceIso),
  );
  if (error) throw new Error(`getActiveSessionsByIdentifier: ${error.message}`);

  const out = new Map<string, ClaudeSession[]>();
  for (const row of (data ?? []) as ClaudeSession[]) {
    if (!row.linear_identifier) continue;
    const arr = out.get(row.linear_identifier) ?? [];
    arr.push(row);
    out.set(row.linear_identifier, arr);
  }
  return out;
}

/** All live Claude Code sessions for a single user — both ticket-pinned
 * (linear_identifier set) and orphan (linear_identifier=null) rows. Powers
 * the "live sessions" header pill on /dashboard so every running terminal
 * appears even if /task-set was never issued.
 *
 * Filters to last STALE_THRESHOLD_MIN minutes; sorted newest-first. */
export async function getActiveSessionsForUser(userId: string): Promise<ClaudeSession[]> {
  const sinceIso = new Date(Date.now() - STALE_THRESHOLD_MIN * 60_000).toISOString();
  const { data, error } = await readClaudeSessions((q) =>
    q.eq('user_id', userId).gt('last_seen_at', sinceIso).order('last_seen_at', { ascending: false }),
  );
  if (error) throw new Error(`getActiveSessionsForUser: ${error.message}`);
  return (data ?? []) as ClaudeSession[];
}

export async function listLiveClaudeSessions(
  windowMinutes = SNAPSHOT_WINDOW_MIN,
  now = new Date(),
): Promise<ClaudeActiveSessionSnapshot[]> {
  return listLiveAgentSessions(windowMinutes, now);
}

export async function cleanupStaleClaudeSessions(
  olderThanHours = CLEANUP_THRESHOLD_HOURS,
  now = new Date(),
): Promise<void> {
  await cleanupStaleAgentSessions(olderThanHours, now);
}

type SessionQuery = {
  in: (column: string, values: unknown[]) => SessionQuery;
  eq: (column: string, value: unknown) => SessionQuery;
  gt: (column: string, value: unknown) => SessionQuery;
  order: (column: string, options: unknown) => SessionQuery;
  then: Promise<{ data?: unknown; error?: { message?: string } | null }>['then'];
};

async function readClaudeSessions(
  configure: (query: SessionQuery) => SessionQuery,
): Promise<{ data?: unknown; error?: { message?: string } | null }> {
  const first = await configure(
    supabaseAdmin.from('claude_sessions').select(SELECT_COLUMNS) as unknown as SessionQuery,
  );
  if (!isMissingCwdColumn(first.error)) return first;
  return configure(
    supabaseAdmin.from('claude_sessions').select(BASE_SELECT_COLUMNS) as unknown as SessionQuery,
  );
}

function isMissingCwdColumn(error: { message?: string } | null | undefined): boolean {
  return /cwd/i.test(error?.message ?? '') && /column|schema|does not exist/i.test(error?.message ?? '');
}
