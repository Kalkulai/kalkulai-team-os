-- Workflow status for project STEPS, persisted so Kanban-DnD survives.
-- Counter/Project rows ignore this column. Steps default to NULL — meaning
-- "derive from completed + due_date" (legacy behavior).
-- Allowed values: 'todo' | 'in-progress' | 'on-hold'. 'done' is derived
-- from kpis.completed (single source of truth) so we don't drift.

alter table kpis add column if not exists status text null
  check (status is null or status in ('todo', 'in-progress', 'on-hold'));
