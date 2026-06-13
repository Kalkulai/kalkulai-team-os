-- Link KPIs to campaigns / projects, and add a lightweight projects table.
-- A counter-KPI can now reference the campaign or project whose work it tracks,
-- so the dashboard can show a campaign/project badge next to it. External sync
-- (gmail/campaigns) can also write actuals via the new kpis.source values.

-- Lightweight project registry. Mirrors the campaigns ownership pattern
-- (owner_member_id references team_members) so KPIs can attach to a project
-- without forcing it into the campaign orchestrator.
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  owner_member_id uuid references team_members(id) on delete set null,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create index if not exists idx_projects_owner on projects(owner_member_id);

alter table projects enable row level security;

-- Supabase Data API exposure (2026): keep anon locked out, allow service-role.
grant select, insert, update, delete on table projects to service_role;

-- Optional links from a KPI to the campaign/project it represents.
-- All nullable + backwards compatible: existing KPIs keep working untouched.
alter table kpis
  add column if not exists campaign_id uuid references campaigns(id) on delete set null;
alter table kpis
  add column if not exists project_id uuid references projects(id) on delete set null;
alter table kpis
  add column if not exists project_name text;

create index if not exists idx_kpis_campaign on kpis(campaign_id);
create index if not exists idx_kpis_project on kpis(project_id);

-- Extend the source whitelist so external sync (kpis/sync) can write actuals.
-- Keep manual + hubspot:calls-week; add external:gmail / external:campaigns.
-- The /adjust route still rejects any non-manual source, so these stay
-- read-only from the UI's +/- buttons.
alter table kpis drop constraint if exists kpis_source_check;
alter table kpis
  add constraint kpis_source_check
    check (source in ('manual', 'hubspot:calls-week', 'external:gmail', 'external:campaigns'));
