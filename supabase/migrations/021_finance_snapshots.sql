-- Finance snapshots for the CFO-Kai dashboard.
-- Hermes pulls the canonical Google Sheets (pull_finance_sheets.py), then POSTs
-- one snapshot per scenario via POST /api/finance/snapshot:
--   'exist'   = EXIST-Förderplan (Kalkulai_EXIST_Finanzplan_v11)
--   'current' = laufender Ist-/Kurzfristplan (z.B. Kalkulai_Finanzplan June-August)
-- GET /api/finance reads the latest row for a scenario; if none exists (or
-- Supabase is unreachable), the route falls back to the code defaults in
-- lib/finance-data.ts. `data` holds the full FinanceData JSON contract.

create table if not exists finance_snapshots (
  id uuid primary key default gen_random_uuid(),
  scenario text not null default 'exist' check (scenario in ('exist', 'current')),
  as_of text not null,
  data jsonb not null,
  source text,
  created_at timestamptz not null default now()
);

create index if not exists finance_snapshots_scenario_created_idx
  on finance_snapshots (scenario, created_at desc);

-- Same lockdown rationale as migration 010: all access goes through Next.js
-- API routes with the service-role key (which bypasses RLS). No anon access.
alter table finance_snapshots enable row level security;
