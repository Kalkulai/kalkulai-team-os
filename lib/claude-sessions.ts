import { supabaseAdmin } from '@/lib/supabase';
import type { ClaudeSession } from '@/types';

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
}

export async function upsertClaudeSession(input: UpsertSessionInput): Promise<void> {
  const { error } = await supabaseAdmin
    .from('claude_sessions')
    .upsert(
      {
        session_id: input.session_id,
        user_id: input.user_id,
        linear_identifier: input.linear_identifier ?? null,
        title: input.title ?? null,
        host: input.host ?? null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'session_id' }
    );
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
    .select('session_id, user_id, linear_identifier, title, host, started_at, last_seen_at')
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
