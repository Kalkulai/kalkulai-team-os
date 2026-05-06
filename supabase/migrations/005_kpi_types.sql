-- Phase 1 of Goals/Projects/KPIs unification.
-- Extends `kpis` table with a discriminator and project-step fields.
--
-- Types:
--   counter — numeric KPI (uses kpi_weeks.target/actual, +/- buttons in UI)
--   project — multi-step initiative (parent of `step` rows, optional due_date)
--   step    — child of a project (parent_id required, due_date + completed)

alter table kpis
  add column if not exists type text not null default 'counter'
    check (type in ('counter', 'project', 'step'));

alter table kpis
  add column if not exists due_date date;

alter table kpis
  add column if not exists completed boolean not null default false;

create index if not exists idx_kpis_type on kpis(type);
