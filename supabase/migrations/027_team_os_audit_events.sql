-- Team-OS actor audit trail.
-- Records who/what initiated important mutations while preserving internal read transparency.

create table if not exists team_os_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_type text not null check (actor_type in ('member', 'hermes', 'cron', 'ops', 'legacy_admin')),
  actor_id text not null,
  scope text,
  action text not null,
  resource_type text,
  resource_id text,
  on_behalf_of_member_id uuid references team_members(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_team_os_audit_created
  on team_os_audit_events(created_at desc);
create index if not exists idx_team_os_audit_actor
  on team_os_audit_events(actor_type, actor_id, created_at desc);
create index if not exists idx_team_os_audit_behalf
  on team_os_audit_events(on_behalf_of_member_id, created_at desc)
  where on_behalf_of_member_id is not null;

alter table team_os_audit_events enable row level security;
grant select, insert on table team_os_audit_events to service_role;
