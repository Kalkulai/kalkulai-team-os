import { supabaseAdmin } from '@/lib/supabase';
import type {
  AgentActiveSessionSnapshot,
  AgentRuntime,
  AgentSessionStatus,
  ClaudeSession,
  TaskHistoryEntry,
} from '@/types';

const SNAPSHOT_WINDOW_MIN = 60;
const CLEANUP_THRESHOLD_HOURS = 24;

const BASE_SELECT_COLUMNS =
  'session_id, user_id, linear_identifier, title, host, cwd, started_at, last_seen_at, task_history';
const LEGACY_SELECT_COLUMNS =
  'session_id, user_id, linear_identifier, title, host, started_at, last_seen_at, task_history';
const AGENT_SELECT_COLUMNS = [
  'session_id',
  'user_id',
  'linear_identifier',
  'title',
  'host',
  'cwd',
  'runtime',
  'status',
  'workstream',
  'branch',
  'worktree_path',
  'terminal_session_id',
  'last_decision',
  'current_state',
  'next_decision',
  'started_at',
  'last_seen_at',
  'task_history',
].join(', ');

const OPTIONAL_AGENT_COLUMNS = [
  'cwd',
  'runtime',
  'status',
  'workstream',
  'branch',
  'worktree_path',
  'terminal_session_id',
  'last_decision',
  'current_state',
  'next_decision',
];

export interface UpsertAgentSessionInput {
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
  task_history?: TaskHistoryEntry[];
}

export async function upsertAgentSession(input: UpsertAgentSessionInput): Promise<void> {
  const row = buildAgentRow(input, true, true);
  const first = await supabaseAdmin
    .from('claude_sessions')
    .upsert(row, { onConflict: 'session_id' });
  if (!isMissingSelectableColumn(first.error)) {
    if (first.error) throw new Error(`upsertAgentSession: ${first.error.message}`);
    return;
  }

  const fallback = buildAgentRow(input, false, !isMissingColumn(first.error, 'cwd'));
  const second = await supabaseAdmin
    .from('claude_sessions')
    .upsert(fallback, { onConflict: 'session_id' });
  if (!isMissingColumn(second.error, 'cwd')) {
    if (second.error) throw new Error(`upsertAgentSession: ${second.error.message}`);
    return;
  }

  const legacyFallback = { ...fallback };
  delete legacyFallback.cwd;
  const { error } = await supabaseAdmin
    .from('claude_sessions')
    .upsert(legacyFallback, { onConflict: 'session_id' });
  if (error) throw new Error(`upsertAgentSession: ${error.message}`);
}

export async function touchAgentSession(session_id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('claude_sessions')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('session_id', session_id);
  if (error) throw new Error(`touchAgentSession: ${error.message}`);
}

export async function clearAgentSession(session_id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('claude_sessions')
    .delete()
    .eq('session_id', session_id);
  if (error) throw new Error(`clearAgentSession: ${error.message}`);
}

export async function listLiveAgentSessions(
  windowMinutes = SNAPSHOT_WINDOW_MIN,
  now = new Date(),
): Promise<AgentActiveSessionSnapshot[]> {
  const sinceIso = new Date(now.getTime() - windowMinutes * 60_000).toISOString();
  const { data, error } = await readAgentSessions((q) =>
    q.gt('last_seen_at', sinceIso).order('last_seen_at', { ascending: false }),
  );
  if (error) throw new Error(`listLiveAgentSessions: ${error.message}`);
  return ((data ?? []) as ClaudeSession[]).map((row) => toAgentSnapshot(row, now));
}

export async function listLiveAgentSessionsForUser(
  userId: string,
  windowMinutes = SNAPSHOT_WINDOW_MIN,
  now = new Date(),
): Promise<AgentActiveSessionSnapshot[]> {
  const sinceIso = new Date(now.getTime() - windowMinutes * 60_000).toISOString();
  const { data, error } = await readAgentSessions((q) =>
    q.eq('user_id', userId).gt('last_seen_at', sinceIso).order('last_seen_at', { ascending: false }),
  );
  if (error) throw new Error(`listLiveAgentSessionsForUser: ${error.message}`);
  return ((data ?? []) as ClaudeSession[]).map((row) => toAgentSnapshot(row, now));
}

export async function cleanupStaleAgentSessions(
  olderThanHours = CLEANUP_THRESHOLD_HOURS,
  now = new Date(),
): Promise<void> {
  const cutoffIso = new Date(now.getTime() - olderThanHours * 60 * 60_000).toISOString();
  const { error } = await supabaseAdmin
    .from('claude_sessions')
    .delete()
    .lt('last_seen_at', cutoffIso);
  if (error) throw new Error(`cleanupStaleAgentSessions: ${error.message}`);
}

function buildAgentRow(
  input: UpsertAgentSessionInput,
  includeAgentColumns: boolean,
  includeCwd: boolean,
): Record<string, unknown> {
  const row: Record<string, unknown> = {
    session_id: input.session_id,
    user_id: input.user_id,
    linear_identifier: input.linear_identifier ?? null,
    title: input.title ?? null,
    host: input.host ?? null,
    last_seen_at: new Date().toISOString(),
  };
  if (includeCwd && input.cwd !== undefined) row.cwd = input.cwd;
  if (input.task_history !== undefined) row.task_history = input.task_history;
  if (!includeAgentColumns) return row;
  row.runtime = input.runtime ?? 'claude';
  row.status = input.status ?? 'running';
  if (input.workstream !== undefined) row.workstream = input.workstream;
  if (input.branch !== undefined) row.branch = input.branch;
  if (input.worktree_path !== undefined) row.worktree_path = input.worktree_path;
  if (input.terminal_session_id !== undefined) row.terminal_session_id = input.terminal_session_id;
  if (input.last_decision !== undefined) row.last_decision = input.last_decision;
  if (input.current_state !== undefined) row.current_state = input.current_state;
  if (input.next_decision !== undefined) row.next_decision = input.next_decision;
  return row;
}

function toAgentSnapshot(row: ClaudeSession, now: Date): AgentActiveSessionSnapshot {
  const lastSeenMs = new Date(row.last_seen_at).getTime();
  const idleMinutes = Number.isFinite(lastSeenMs)
    ? Math.max(0, Math.ceil((now.getTime() - lastSeenMs) / 60_000))
    : 0;
  return {
    ...row,
    runtime: normalizeRuntime(row.runtime),
    status: normalizeStatus(row.status),
    idle_minutes: idleMinutes,
    linear_url: buildLinearUrl(row.linear_identifier),
  };
}

function normalizeRuntime(value: unknown): AgentRuntime {
  return value === 'codex' || value === 'shell' || value === 'hermes' || value === 'claude'
    ? value
    : 'claude';
}

function normalizeStatus(value: unknown): AgentSessionStatus {
  return value === 'idle' ||
    value === 'running' ||
    value === 'blocked' ||
    value === 'review' ||
    value === 'done' ||
    value === 'failed'
    ? value
    : 'running';
}

function buildLinearUrl(identifier: string | null): string | null {
  if (!identifier) return null;
  return `https://linear.app/kalkulai-team/issue/${encodeURIComponent(identifier)}`;
}

type SessionQuery = {
  in: (column: string, values: unknown[]) => SessionQuery;
  eq: (column: string, value: unknown) => SessionQuery;
  gt: (column: string, value: unknown) => SessionQuery;
  lt: (column: string, value: unknown) => SessionQuery;
  order: (column: string, options: unknown) => SessionQuery;
  then: Promise<{ data?: unknown; error?: { message?: string } | null }>['then'];
};

async function readAgentSessions(
  configure: (query: SessionQuery) => SessionQuery,
): Promise<{ data?: unknown; error?: { message?: string } | null }> {
  const first = await configure(
    supabaseAdmin.from('claude_sessions').select(AGENT_SELECT_COLUMNS) as unknown as SessionQuery,
  );
  if (!isMissingSelectableColumn(first.error)) return first;
  const fallbackColumns = isMissingColumn(first.error, 'cwd') ? LEGACY_SELECT_COLUMNS : BASE_SELECT_COLUMNS;
  const second = await configure(
    supabaseAdmin.from('claude_sessions').select(fallbackColumns) as unknown as SessionQuery,
  );
  if (!isMissingColumn(second.error, 'cwd') || fallbackColumns === LEGACY_SELECT_COLUMNS) return second;
  return configure(
    supabaseAdmin.from('claude_sessions').select(LEGACY_SELECT_COLUMNS) as unknown as SessionQuery,
  );
}

function isMissingSelectableColumn(error: unknown): boolean {
  const message = errorMessage(error);
  if (!/column|schema|does not exist/i.test(message)) return false;
  return OPTIONAL_AGENT_COLUMNS.some((column) => new RegExp(column, 'i').test(message));
}

function isMissingColumn(error: unknown, column: string): boolean {
  const message = errorMessage(error);
  return /column|schema|does not exist/i.test(message) && new RegExp(column, 'i').test(message);
}

function errorMessage(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
