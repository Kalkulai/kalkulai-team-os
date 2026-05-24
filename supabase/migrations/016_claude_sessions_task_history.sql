-- KAL-133: claude_sessions.task_history — multi-ticket session history.
--
-- A single Claude Code session often touches several Linear tickets across
-- the day (set → hold → set new → done). Migration 015 only kept the
-- "current_task" snapshot. The local state file at
-- ~/.claude/task-sessions/<session_id>.json already maintains a `task_history`
-- array (see task-state.js cmdSet/cmdClear). This migration mirrors it into
-- the dashboard so the daily-recap audit can answer "what did this session
-- work on today" beyond just the active pin.
--
-- Entry shape (matches local state-file):
--   { "linear_id": "KAL-XX", "action": "hold" | "done" | "switch", "at": "2026-05-24T12:34:56.789Z" }

alter table claude_sessions
  add column if not exists task_history jsonb not null default '[]'::jsonb;
