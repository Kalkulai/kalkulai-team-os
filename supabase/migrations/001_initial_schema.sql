-- supabase/migrations/001_initial_schema.sql

create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique not null,
  telegram_chat_id text,
  linear_user_id text,
  github_username text,
  hubspot_owner_id text,
  google_calendar_id text,
  role text not null check (role in ('dev', 'sales')),
  created_at timestamptz default now()
);

create table if not exists kpi_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references team_members(id) on delete cascade,
  week_start date not null,
  tasks_target int not null default 5,
  calls_target int not null default 0,
  bugs_target int not null default 0,
  unique(user_id, week_start)
);

create table if not exists kpi_daily (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references team_members(id) on delete cascade,
  date date not null,
  tasks_completed int not null default 0,
  calls_made int not null default 0,
  bugs_fixed int not null default 0,
  commits_count int not null default 0,
  unique(user_id, date)
);

create table if not exists sales_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references team_members(id) on delete cascade,
  type text not null,
  note text,
  logged_at timestamptz default now()
);
