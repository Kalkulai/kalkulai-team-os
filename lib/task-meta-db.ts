import { supabaseAdmin } from '@/lib/supabase';
import type { TaskMeta, TaskContext, TaskEnergy } from '@/lib/task-meta';

interface TaskMetaRow {
  linear_issue_id: string;
  context: TaskContext | null;
  effort_minutes: number | null;
  important: boolean;
  urgent: boolean;
  energy: TaskEnergy | null;
  project_id: string | null;
  fixed: boolean;
}

const SELECT_COLS =
  'linear_issue_id, context, effort_minutes, important, urgent, energy, project_id, fixed';

function rowToMeta(r: TaskMetaRow): TaskMeta {
  return {
    context: r.context,
    effortMinutes: r.effort_minutes,
    important: r.important,
    urgent: r.urgent,
    energy: r.energy,
    projectId: r.project_id,
    fixed: r.fixed,
  };
}

/** Map linearIssueId → TaskMeta for the given ids. */
export async function getTaskMetaByIssueIds(
  ids: string[],
): Promise<Record<string, TaskMeta>> {
  if (!ids.length) return {};
  const { data, error } = await supabaseAdmin
    .from('task_meta')
    .select(SELECT_COLS)
    .in('linear_issue_id', ids);
  if (error) throw error;
  const out: Record<string, TaskMeta> = {};
  for (const r of (data ?? []) as TaskMetaRow[]) out[r.linear_issue_id] = rowToMeta(r);
  return out;
}

/** Full-row upsert (the client always sends the complete meta state). */
export async function upsertTaskMeta(
  linearIssueId: string,
  userId: string,
  meta: TaskMeta,
): Promise<void> {
  const { error } = await supabaseAdmin.from('task_meta').upsert(
    {
      linear_issue_id: linearIssueId,
      user_id: userId,
      context: meta.context,
      effort_minutes: meta.effortMinutes,
      important: meta.important,
      urgent: meta.urgent,
      energy: meta.energy,
      project_id: meta.projectId,
      fixed: meta.fixed,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'linear_issue_id' },
  );
  if (error) throw error;
}
