-- Add worker_ids to task_meta: tracks who is actively working on a task.
-- UUIDs reference team_members.id (Supabase user IDs, not Linear).
ALTER TABLE task_meta
  ADD COLUMN IF NOT EXISTS worker_ids uuid[] NOT NULL DEFAULT '{}';
