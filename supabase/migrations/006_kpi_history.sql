-- Per-day snapshots of counter-KPI actuals. Drives the sparkline trend
-- on the dashboard. Filled by adjustKpiActual (upsert on conflict) and
-- optionally backfilled by a daily cron.

create table if not exists kpi_history (
  kpi_id uuid not null references kpis(id) on delete cascade,
  day date not null,
  actual int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (kpi_id, day)
);

create index if not exists idx_kpi_history_day on kpi_history(day);
