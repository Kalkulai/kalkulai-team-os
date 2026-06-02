-- Agent Cockpit metadata for Claude, Codex, Hermes and local shell sessions.
-- Keeps the existing claude_sessions table/API intact while adding generic
-- session fields used by /dashboard/agents.

alter table claude_sessions
  add column if not exists runtime text not null default 'claude',
  add column if not exists status text not null default 'running',
  add column if not exists workstream text,
  add column if not exists branch text,
  add column if not exists worktree_path text,
  add column if not exists terminal_session_id text,
  add column if not exists last_decision text,
  add column if not exists current_state text,
  add column if not exists next_decision text;

create index if not exists idx_claude_sessions_runtime_last_seen
  on claude_sessions(runtime, last_seen_at desc);

create index if not exists idx_claude_sessions_terminal
  on claude_sessions(terminal_session_id) where terminal_session_id is not null;
