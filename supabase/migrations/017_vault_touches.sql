-- KAL-134: vault_touches — non-committed file activity for the daily-recap.
--
-- Operations sprints (SOPs, ADRs, sales drafts, meeting notes) often produce
-- vault edits that never reach the GitHub search the recap aggregator uses.
-- This table is a flat per-file activity ledger: one row per vault path, last
-- modified time + size. The agents-01 host runs `vault-touches-sync.sh` every
-- N minutes to scan the live filesystem and push the touched files here. The
-- recap aggregator then reads any rows whose `last_modified_at` falls in the
-- target day window, surfacing operations-sprint output that has not been
-- committed yet.
--
-- One writer (agents-01 cron) keeps the table small (<5k rows in practice).

create table if not exists vault_touches (
  path text primary key,
  last_modified_at timestamptz not null,
  size_bytes integer not null default 0,
  source_host text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_vault_touches_last_modified
  on vault_touches(last_modified_at desc);

alter table vault_touches enable row level security;
