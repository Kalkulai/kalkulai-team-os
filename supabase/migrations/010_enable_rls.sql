-- Lock down direct REST-API access via the public anon key.
-- All legitimate access goes through Next.js API-Routes using the
-- Service-Role key, which bypasses RLS by design. Hermes uses the
-- same routes via DASHBOARD_API_SECRET. Browser components never
-- talk to Supabase directly. So: no policies needed — default
-- "deny all for anon/authenticated" is exactly right.
--
-- task_links already has RLS enabled (initial schema). Skipping it.

alter table team_members enable row level security;
alter table kpis enable row level security;
alter table kpi_weeks enable row level security;
alter table kpi_history enable row level security;
alter table kpi_targets enable row level security;
alter table kpi_daily enable row level security;
alter table sales_logs enable row level security;
