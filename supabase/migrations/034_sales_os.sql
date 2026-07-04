-- Sales OS (CSO-Agent Phase 1): companies, contacts, endpoints, activities.
-- Member-scoped via owner_member_id; access only via service-role (RLS locked).

create table if not exists sales_companies (
  id uuid primary key default gen_random_uuid(),
  owner_member_id uuid not null references team_members(id) on delete cascade,
  hubspot_company_id text unique,
  name text not null,
  website text,
  industry text,
  status text not null default 'lead',
  next_step text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sales_contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references sales_companies(id) on delete cascade,
  hubspot_contact_id text unique,
  first_name text not null default '',
  last_name text not null default '',
  role text,
  email text,
  -- Entscheidung 5: Imports gelten als consented (Pauls Verantwortung);
  -- manuell angelegte Kontakte starten ebenfalls true, Toggle in der UI.
  recording_consent boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sales_endpoints (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references sales_companies(id) on delete cascade,
  contact_id uuid references sales_contacts(id) on delete cascade,
  channel text not null check (channel in ('phone', 'mobile', 'whatsapp', 'email', 'linkedin')),
  value text not null,
  endpoint_type text not null default 'generic'
    check (endpoint_type in ('direct', 'mobile', 'switchboard', 'assistant', 'location', 'generic')),
  source text not null default 'hubspot',
  validity_status text not null default 'unverified'
    check (validity_status in ('unverified', 'verified', 'invalid')),
  do_not_call boolean not null default false,
  priority int not null default 0,
  created_at timestamptz not null default now(),
  unique (company_id, channel, value)
);

create table if not exists sales_activities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references sales_companies(id) on delete cascade,
  contact_id uuid references sales_contacts(id) on delete set null,
  activity_type text not null
    check (activity_type in ('call', 'email', 'whatsapp', 'meeting', 'task', 'note', 'transcript', 'sync')),
  direction text check (direction in ('inbound', 'outbound', 'internal')),
  occurred_at timestamptz not null default now(),
  source_system text not null default 'manual',
  provider_event_id text unique,
  title text not null,
  summary text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_sales_companies_owner on sales_companies(owner_member_id);
create index if not exists idx_sales_contacts_company on sales_contacts(company_id);
create index if not exists idx_sales_endpoints_company on sales_endpoints(company_id);
create index if not exists idx_sales_activities_company on sales_activities(company_id, occurred_at desc);

alter table sales_companies enable row level security;
alter table sales_contacts enable row level security;
alter table sales_endpoints enable row level security;
alter table sales_activities enable row level security;
