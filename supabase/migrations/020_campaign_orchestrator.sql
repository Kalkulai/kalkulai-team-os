-- GTM Campaign Orchestrator v1.
-- Team-OS owns campaign state; external systems provide events/tasks.

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('partnerships', 'handwerker')),
  status text not null default 'active' check (status in ('draft', 'active', 'paused', 'done', 'archived')),
  owner_member_id uuid references team_members(id) on delete set null,
  source text,
  external_id text,
  constraint campaigns_source_external_id_unique unique (source, external_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists campaign_leads (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  display_name text,
  company_name text,
  email text,
  owner_member_id uuid references team_members(id) on delete set null,
  external_system text,
  external_id text,
  constraint campaign_leads_external_unique unique (campaign_id, external_system, external_id),
  stage text not null default 'sourced' check (
    stage in (
      'sourced',
      'ready',
      'sent',
      'replied',
      'followup_due',
      'meeting_booked',
      'blocked',
      'disqualified'
    )
  ),
  next_action text,
  next_action_at timestamptz,
  last_touch_at timestamptz,
  source text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists campaign_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  lead_id uuid references campaign_leads(id) on delete cascade,
  event_type text not null check (
    event_type in ('sent', 'replied', 'opened', 'followup_due', 'meeting_booked', 'blocked', 'note')
  ),
  occurred_at timestamptz not null default now(),
  source text,
  external_id text,
  constraint campaign_events_source_external_id_unique unique (source, external_id),
  summary text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists campaign_action_log (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  lead_id uuid references campaign_leads(id) on delete cascade,
  action_type text not null check (action_type in ('hubspot_task', 'linear_task')),
  idempotency_key text not null unique,
  external_id text,
  status text not null default 'created' check (status in ('created', 'skipped', 'failed')),
  created_at timestamptz not null default now()
);

create index if not exists idx_campaigns_type_status on campaigns(type, status);
create index if not exists idx_campaign_leads_campaign_stage on campaign_leads(campaign_id, stage);
create index if not exists idx_campaign_leads_next_action on campaign_leads(next_action_at) where next_action_at is not null;
create index if not exists idx_campaign_events_campaign on campaign_events(campaign_id, occurred_at desc);
create index if not exists idx_campaign_events_lead on campaign_events(lead_id, occurred_at desc) where lead_id is not null;

alter table campaigns enable row level security;
alter table campaign_leads enable row level security;
alter table campaign_events enable row level security;
alter table campaign_action_log enable row level security;

-- Supabase Data API exposure changed in 2026: new public tables may require
-- explicit grants. Keep browser/anon locked out, but allow our Next.js
-- service-role API layer to read/write these tables.
grant select, insert, update, delete on table campaigns to service_role;
grant select, insert, update, delete on table campaign_leads to service_role;
grant select, insert, update, delete on table campaign_events to service_role;
grant select, insert, update, delete on table campaign_action_log to service_role;
