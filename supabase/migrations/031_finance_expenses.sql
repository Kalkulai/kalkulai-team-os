-- EXIST expense ledger for the operative finance cockpit.
-- Raw rows stay separate from finance_snapshots so Pre-EXIST snapshot rendering
-- and existing FinanceData remain untouched.

create table if not exists finance_expenses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  expense_date date not null,
  vendor text not null,
  description text not null,
  category text,
  amount_eur numeric(12,2) not null,

  paid_by text not null,
  legal_entity text not null default 'private'
    check (legal_entity in ('private','gmbh','chair')),
  scenario text not null default 'exist'
    check (scenario in ('exist','pre-exist')),

  funding_pot text not null default 'unclear'
    check (funding_pot in ('sachmittel','coaching','stipend','non_fundable','unclear')),
  fundability text not null default 'unclear'
    check (fundability in ('fundable','non_fundable','unclear')),
  reimbursable text not null default 'unclear'
    check (reimbursable in ('yes','no','unclear')),
  reimbursement_status text not null default 'open'
    check (reimbursement_status in ('open','submitted','approved','reimbursed','rejected','n_a')),
  receipt_status text not null default 'missing'
    check (receipt_status in ('missing','available')),
  approval_status text not null default 'not_checked'
    check (approval_status in ('not_checked','checked','needs_clarification')),

  source text not null default 'manual_ui'
    check (source in ('hermes','manual_ui','import')),
  source_message text,
  note text,

  idempotency_key text unique
);

create index if not exists finance_expenses_scenario_date_idx
  on finance_expenses (scenario, expense_date desc);
create index if not exists finance_expenses_reimb_idx
  on finance_expenses (reimbursement_status);

-- Same lockdown rationale as migration 021/010: all access goes through Next.js
-- API routes with the service-role key (which bypasses RLS). No anon access.
alter table finance_expenses enable row level security;
