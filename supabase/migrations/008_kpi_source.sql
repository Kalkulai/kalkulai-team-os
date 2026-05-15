-- KPI tracking source. Lets users mark a counter as auto-tracked from an
-- external system, so the dashboard reads its value live instead of relying
-- on +/- clicks.
--
-- Whitelist:
--   manual              — default; value lives in kpi_weeks.actual
--   hubspot:calls-week  — value = HubSpot calls this week for member.hubspot_owner_id
--
-- Project/step rows are always 'manual' (source is ignored for non-counter types).

alter table kpis
  add column if not exists source text not null default 'manual'
    check (source in ('manual', 'hubspot:calls-week'));

create index if not exists idx_kpis_source on kpis(source);
