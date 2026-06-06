-- Felix-only task metadata side-table (Phase 1 of Kai timeboxing).
-- Linear remains source of truth for title/status/dueDate/priority.
-- These fields power richer planning: context, effort, Eisenhower, energy, project link.
create table if not exists task_meta (
  id uuid primary key default gen_random_uuid(),
  linear_issue_id text not null unique,
  user_id uuid not null,
  context text check (context in ('business','private')),
  effort_minutes int check (effort_minutes is null or effort_minutes > 0),
  important boolean not null default false,
  urgent boolean not null default false,
  energy text check (energy in ('deep','admin')),
  project_id uuid,
  fixed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists task_meta_user_idx on task_meta(user_id);
