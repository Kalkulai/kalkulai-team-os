import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { KpiWithWeek, LinearIssue, TaskSource } from '@/types';

export type UnifiedStatus = 'todo' | 'in-progress' | 'on-hold' | 'done';
export type UnifiedTaskKind = 'linear' | 'step';

export interface UnifiedTask {
  id: string;
  kind: UnifiedTaskKind;
  title: string;
  status: UnifiedStatus;
  dueDate: string | null;
  identifier?: string;
  url?: string;
  priority?: number;
  source?: TaskSource;
  project?: { id: string; name: string } | null;
}

export function deriveLinearStatus(issue: LinearIssue): UnifiedStatus {
  const t = issue.state.type;
  if (t === 'completed' || t === 'cancelled') return 'done';
  if (t === 'started') return 'in-progress';
  if (/hold|block/i.test(issue.state.name)) return 'on-hold';
  return 'todo';
}

export function deriveStepStatus(step: KpiWithWeek): UnifiedStatus {
  if (step.completed) return 'done';
  if (step.due_date) {
    try {
      const days = differenceInCalendarDays(parseISO(step.due_date), new Date());
      if (days <= 0) return 'in-progress';
    } catch {
      // ignore parse errors
    }
  }
  return 'todo';
}

function urgencyBucket(t: UnifiedTask): number {
  if (!t.dueDate) return 2;
  try {
    const days = differenceInCalendarDays(parseISO(t.dueDate), new Date());
    if (days < 0) return 0;
    if (days === 0) return 1;
    return 2;
  } catch {
    return 2;
  }
}

const prioRank = (p: number | undefined) => (p === undefined || p === 0 ? 99 : p);

export function mergeTasks(
  issues: LinearIssue[],
  steps: KpiWithWeek[],
  projects: KpiWithWeek[],
): UnifiedTask[] {
  const projectMap = new Map(projects.map((p) => [p.id, p.name]));

  const linearTasks: UnifiedTask[] = issues.map((issue) => ({
    id: issue.id,
    kind: 'linear',
    title: issue.title,
    status: deriveLinearStatus(issue),
    dueDate: issue.dueDate ?? null,
    identifier: issue.identifier,
    priority: issue.priority,
    source: issue.source,
    project: null,
  }));

  const stepTasks: UnifiedTask[] = steps
    .filter((s) => s.type === 'step')
    .map((step) => ({
      id: step.id,
      kind: 'step',
      title: step.name,
      status: deriveStepStatus(step),
      dueDate: step.due_date,
      project: step.parent_id
        ? { id: step.parent_id, name: projectMap.get(step.parent_id) ?? 'Projekt' }
        : null,
    }));

  return [...linearTasks, ...stepTasks]
    .filter((t) => t.status !== 'done')
    .sort((a, b) => {
      const ub = urgencyBucket(a) - urgencyBucket(b);
      if (ub !== 0) return ub;
      return prioRank(a.priority) - prioRank(b.priority);
    });
}
