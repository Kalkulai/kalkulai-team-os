import { supabaseAdmin } from '@/lib/supabase';
import type { ClaudeSession, TaskHistoryEntry } from '@/types';

/**
 * Claude Code session tracker — the data layer behind the Kanban "active task"
 * badge. One row in `claude_sessions` per running Claude Code session
 * (~/.claude/task-sessions/<session_id>.json). The session-pre-tool hook
 * pushes upserts here so the dashboard can show which human-host pair is
 * currently working on which Linear ticket. Stale rows (>10 min since
 * last_seen_at) are swept by a cron — see migration 015.
 */

const STALE_THRESHOLD_MIN = 10;

export interface UpsertSessionInput {
  session_id: string;
  user_id: string;
  linear_identifier?: string | null;
  title?: string | null;
  host?: string | null;
  /** Optional snapshot of the local task_history array. When provided, the
   *  server overwrites the persisted history wholesale — safe because the
   *  local state file is the authoritative source per session (one writer,
   *  see KAL-133). */
  task_history?: TaskHistoryEntry[];
}

export async function upsertClaudeSession(input: UpsertSessionInput): Promise<void> {
  const row: Record<string, unknown> = {
    session_id: input.session_id,
    user_id: input.user_id,
    linear_identifier: input.linear_identifier ?? null,
    title: input.title ?? null,
    host: input.host ?? null,
    last_seen_at: new Date().toISOString(),
  };
  if (input.task_history !== undefined) row.task_history = input.task_history;
  const { error } = await supabaseAdmin
    .from('claude_sessions')
    .upsert(row, { onConflict: 'session_id' });
  if (error) throw new Error(`upsertClaudeSession: ${error.message}`);
}

export async function touchClaudeSession(session_id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('claude_sessions')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('session_id', session_id);
  if (error) throw new Error(`touchClaudeSession: ${error.message}`);
}

export async function clearClaudeSession(session_id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('claude_sessions')
    .delete()
    .eq('session_id', session_id);
  if (error) throw new Error(`clearClaudeSession: ${error.message}`);
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
  const { data, error } = await supabaseAdmin
    .from('claude_sessions')
    .select('session_id, user_id, linear_identifier, title, host, started_at, last_seen_at, task_history')
    .in('linear_identifier', identifiers)
    .gt('last_seen_at', sinceIso);
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
  const { data, error } = await supabaseAdmin
    .from('claude_sessions')
    .select('session_id, user_id, linear_identifier, title, host, started_at, last_seen_at, task_history')
    .eq('user_id', userId)
    .gt('last_seen_at', sinceIso)
    .order('last_seen_at', { ascending: false });
  if (error) throw new Error(`getActiveSessionsForUser: ${error.message}`);
  return (data ?? []) as ClaudeSession[];
}
