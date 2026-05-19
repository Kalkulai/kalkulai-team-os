-- Universal time-series store for business metrics.
-- Each row is one (member, metric_key, day) snapshot. Idempotent upsert.
-- meta jsonb holds raw context (e.g. linear-issue-ids, hubspot-deal-ids)
-- so Hermes can drill down without a second query.

create table if not exists business_metrics (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references team_members(id) on delete cascade,
  metric_key text not null,
  day date not null,
  value numeric not null default 0,
  meta jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, metric_key, day)
);

create index if not exists idx_business_metrics_day on business_metrics(day desc);
create index if not exists idx_business_metrics_member_key_day
  on business_metrics(member_id, metric_key, day desc);
create index if not exists idx_business_metrics_key_day
  on business_metrics(metric_key, day desc);

alter table business_metrics enable row level security;
