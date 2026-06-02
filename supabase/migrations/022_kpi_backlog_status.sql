-- Vierter Workflow-Status fuer Projekt-STEPS: 'backlog' (= "Build 1"-Parkplatz,
-- noch nicht auf dem Kanban-Board sichtbar). Nur Felix nutzt diesen Default
-- (Gating in lib/backlog-access.ts), die Spalte selbst bleibt member-agnostisch.
--
-- Migration 009 legte den Constraint inline an -> Postgres-Auto-Name 'kpis_status_check'.
-- Falls DROP ein No-Op ist (abweichender Name), Constraint-Name per '\d kpis' pruefen.

alter table kpis drop constraint if exists kpis_status_check;
alter table kpis add constraint kpis_status_check
  check (status is null or status in ('todo', 'in-progress', 'on-hold', 'backlog'));

-- Einmaliger Backfill: alle offenen, noch nicht gestarteten Felix-Steps in den Backlog.
-- 'in-progress'/'on-hold' bleiben unangetastet. NULL & 'todo' = "nicht gestartet".
update kpis
   set status = 'backlog'
 where user_id = 'c9677ade-e42c-4593-81c6-7a2108b145fd'
   and type = 'step'
   and completed = false
   and (status is null or status = 'todo');
