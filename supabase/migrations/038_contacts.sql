-- Network CRM v1: KalkulAI-relevant contacts outside Sales OS.
-- Access via service-role API routes only (RLS locked).

create table if not exists contacts (
  id                        text primary key,
  name                      text not null,
  relationship_to_kalkulai  text,
  subcategory               text default 'contact',
  status                    text default 'tracking',
  connection_strength       text default 'unknown',
  last_contact_date         date,
  next_action               text,
  next_action_date          date,
  linkedin                  text,
  email                     text,
  phone                     text,
  tags                      text[] default '{}',
  related                   text[] default '{}',
  introduced_by             text,
  created_at                timestamptz default now(),
  updated_at                timestamptz default now()
);

create index if not exists contacts_subcategory_idx on contacts (subcategory);
create index if not exists contacts_tags_idx on contacts using gin (tags);

alter table contacts enable row level security;
