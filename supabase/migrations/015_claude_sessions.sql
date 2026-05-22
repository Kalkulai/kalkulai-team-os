-- Claude Code session tracking — which Linear ticket is being worked on
-- right now, by which human, on which host. Powers the Kanban-card
-- "active task" badge (🤖 KAL-XX is live).
--
-- Lifecycle:
--   /task-set or /task-new   → upsert with linear_identifier set
--   /task-done /task-hold    → row deleted (or linear_identifier cleared)
--   PreToolUse touch         → last_seen_at = now()
--   Stale (>10min old)       → cron sweep deletes
--
-- Service-role writes from Next.js API routes. RLS denies anon as usual.

create table if not exists claude_sessions (
  session_id text primary key,
  user_id uuid not null references team_members(id) on delete cascade,
  linear_identifier text,
  title text,
  host text,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists idx_claude_sessions_linear
  on claude_sessions(linear_identifier) where linear_identifier is not null;
create index if not exists idx_claude_sessions_user_last_seen
  on claude_sessions(user_id, last_seen_at desc);

alter table claude_sessions enable row level security;
