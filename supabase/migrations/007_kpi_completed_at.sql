-- Timestamp when a project STEP flips to completed.
-- Counter-KPIs (type='counter') are never "completed" via this flag — they
-- increment via kpi_weeks.actual. Only steps (type='step') set completed_at.
-- The Activity-Stream filters on type='step' AND completed_at IS NOT NULL.

alter table kpis add column if not exists completed_at timestamptz null;

create index if not exists idx_kpis_completed_at on kpis(completed_at);
