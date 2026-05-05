-- Custom KPIs per user, optionally hierarchical (parent_id), with per-week target/actual.
-- Replaces the hardcoded kpi_targets/kpi_daily flow for dashboard display.
-- Old tables remain intact (Telegram briefing format still queries them).

create table if not exists kpis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references team_members(id) on delete cascade,
  parent_id uuid references kpis(id) on delete cascade,
  name text not null,
  unit text not null default '',
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists kpi_weeks (
  id uuid primary key default gen_random_uuid(),
  kpi_id uuid not null references kpis(id) on delete cascade,
  week_start date not null,
  target int not null default 0,
  actual int not null default 0,
  unique(kpi_id, week_start)
);

create index if not exists idx_kpis_user on kpis(user_id);
create index if not exists idx_kpis_parent on kpis(parent_id);
create index if not exists idx_kpi_weeks_week on kpi_weeks(week_start);
create index if not exists idx_kpi_weeks_kpi on kpi_weeks(kpi_id);
