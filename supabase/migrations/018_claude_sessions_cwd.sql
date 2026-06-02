-- KAL-153: optional current working directory for session snapshot UI.
-- Existing hooks can omit this field; task-state hooks that know the repo cwd
-- can include it in /api/claude/active-task payloads.

alter table claude_sessions
  add column if not exists cwd text;
