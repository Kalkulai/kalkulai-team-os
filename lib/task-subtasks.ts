import { supabaseAdmin } from '@/lib/supabase';
import type { TaskSubtask } from '@/types';

interface SubtaskRow {
  id: string;
  linear_issue_id: string;
  title: string;
  completed: boolean;
  position: number;
  created_at: string;
}

function rowToSubtask(r: SubtaskRow): TaskSubtask {
  return {
    id: r.id,
    linearIssueId: r.linear_issue_id,
    title: r.title,
    completed: r.completed,
    position: r.position,
    createdAt: r.created_at,
  };
}

export async function getSubtasks(linearIssueId: string): Promise<TaskSubtask[]> {
  const { data, error } = await supabaseAdmin
    .from('task_subtasks')
    .select('*')
    .eq('linear_issue_id', linearIssueId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToSubtask);
}

export async function createSubtask(linearIssueId: string, title: string): Promise<TaskSubtask> {
  const { data, error } = await supabaseAdmin
    .from('task_subtasks')
    .insert({ linear_issue_id: linearIssueId, title })
    .select('*')
    .single();
  if (error) throw error;
  return rowToSubtask(data as SubtaskRow);
}

export async function updateSubtask(
  id: string,
  patch: { title?: string; completed?: boolean },
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('task_subtasks')
    .update(patch)
    .eq('id', id);
  if (error) throw error;
}

export async function deleteSubtask(id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('task_subtasks')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function getSubtaskCountsForIssues(
  linearIssueIds: string[],
): Promise<Record<string, { total: number; done: number }>> {
  if (!linearIssueIds.length) return {};
  const { data, error } = await supabaseAdmin
    .from('task_subtasks')
    .select('linear_issue_id, completed')
    .in('linear_issue_id', linearIssueIds);
  if (error) throw error;
  const out: Record<string, { total: number; done: number }> = {};
  for (const row of (data ?? []) as { linear_issue_id: string; completed: boolean }[]) {
    const cur = out[row.linear_issue_id] ?? { total: 0, done: 0 };
    cur.total += 1;
    if (row.completed) cur.done += 1;
    out[row.linear_issue_id] = cur;
  }
  return out;
}

export async function getSubtasksForIssues(
  linearIssueIds: string[],
): Promise<Record<string, TaskSubtask[]>> {
  if (!linearIssueIds.length) return {};
  const { data, error } = await supabaseAdmin
    .from('task_subtasks')
    .select('*')
    .in('linear_issue_id', linearIssueIds)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  const out: Record<string, TaskSubtask[]> = {};
  for (const row of (data ?? []) as SubtaskRow[]) {
    const arr = out[row.linear_issue_id] ?? [];
    arr.push(rowToSubtask(row));
    out[row.linear_issue_id] = arr;
  }
  return out;
}
