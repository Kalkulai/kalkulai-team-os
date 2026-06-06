import { supabaseAdmin } from '@/lib/supabase';
import type { TaskAssist, TaskFollowup } from '@/lib/task-assist';

interface TaskAssistRow {
  linear_issue_id: string;
  suggested_next_step: string | null;
  suggested_followups: TaskFollowup[] | null;
  updated_at: string | null;
}

const SELECT_COLS = 'linear_issue_id, suggested_next_step, suggested_followups, updated_at';

function rowToAssist(r: TaskAssistRow): TaskAssist {
  return {
    suggestedNextStep: r.suggested_next_step,
    suggestedFollowups: Array.isArray(r.suggested_followups) ? r.suggested_followups : [],
    updatedAt: r.updated_at,
  };
}

export async function getTaskAssistByIssueIds(
  ids: string[],
): Promise<Record<string, TaskAssist>> {
  if (!ids.length) return {};
  const { data, error } = await supabaseAdmin
    .from('task_assist')
    .select(SELECT_COLS)
    .in('linear_issue_id', ids);
  if (error) throw error;
  const out: Record<string, TaskAssist> = {};
  for (const r of (data ?? []) as TaskAssistRow[]) out[r.linear_issue_id] = rowToAssist(r);
  return out;
}

export async function upsertTaskAssist(
  linearIssueId: string,
  userId: string,
  nextStep: string | null,
  followups: TaskFollowup[],
): Promise<void> {
  const { error } = await supabaseAdmin.from('task_assist').upsert(
    {
      linear_issue_id: linearIssueId,
      user_id: userId,
      suggested_next_step: nextStep,
      suggested_followups: followups,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'linear_issue_id' },
  );
  if (error) throw error;
}
