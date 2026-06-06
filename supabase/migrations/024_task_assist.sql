-- Felix-only: per-task assistance from Kai (Hermes) — next step + follow-up task
-- suggestions. Phase 2 slice 1 of the Kai coworker capability ladder.
create table if not exists task_assist (
  id uuid primary key default gen_random_uuid(),
  linear_issue_id text not null unique,
  user_id uuid not null,
  suggested_next_step text,
  suggested_followups jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists task_assist_user_idx on task_assist(user_id);
