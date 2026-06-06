-- Felix-only: Kai's timeboxed day plan (Phase 2 slice 3). One row per user+date;
-- blocks is an ordered list of timeboxed entries (tasks, meetings, focus, breaks).
create table if not exists day_plan (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  plan_date date not null,
  blocks jsonb not null default '[]'::jsonb,
  generated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, plan_date)
);

create index if not exists day_plan_user_date_idx on day_plan(user_id, plan_date);
