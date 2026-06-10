-- task_meta, task_assist, day_plan wurden in 023/024/025 ohne RLS angelegt.
-- Muster identisch zu 020_campaign_orchestrator.sql.

alter table task_meta enable row level security;
alter table task_assist enable row level security;
alter table day_plan enable row level security;

-- Expliziter Grant notwendig (Supabase 2026 Verhalten für neue public tables)
grant select, insert, update, delete on table task_meta to service_role;
grant select, insert, update, delete on table task_assist to service_role;
grant select, insert, update, delete on table day_plan to service_role;
