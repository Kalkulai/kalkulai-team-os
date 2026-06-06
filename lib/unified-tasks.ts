import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { KpiWithWeek, LinearIssue, TaskSource } from '@/types';
import { parseTeamTaskGroupId, parseTeamTaskAssignees } from '@/lib/team-tasks';
import type { TaskMeta } from '@/lib/task-meta';
import type { TaskAssist } from '@/lib/task-assist';

export type UnifiedStatus = 'todo' | 'in-progress' | 'on-hold' | 'done' | 'backlog';
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
  completedAt?: string;
  teamTask?: { groupId: string; assigneeUserIds: string[] };
  /** Felix-only planning metadata (context, effort, Eisenhower, energy, project, fixed). */
  meta?: TaskMeta | null;
  /** Felix-only: Kai's per-task suggestion (next step + follow-up tasks). */
  assist?: TaskAssist | null;
}

export function deriveLinearStatus(issue: LinearIssue): UnifiedStatus {
  const t = issue.state.type;
  if (t === 'completed' || t === 'cancelled') return 'done';
  if (/hold|block/i.test(issue.state.name)) return 'on-hold';
  if (t === 'started') return 'in-progress';
  return 'todo';
}

export function deriveStepStatus(step: KpiWithWeek): UnifiedStatus {
  if (step.completed) return 'done';
  if (step.status === 'backlog') return 'backlog';
  // Persisted Kanban status wins over the auto-derived one.
  if (step.status === 'todo' || step.status === 'in-progress' || step.status === 'on-hold') {
    return step.status;
  }
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

const prioRank = (p: number | undefined) => (p === undefined || p === 0 ? 99 : p);

export function mergeTasks(
  issues: LinearIssue[],
  steps: KpiWithWeek[],
  projects: KpiWithWeek[],
  metaByIssueId?: Record<string, TaskMeta>,
  assistByIssueId?: Record<string, TaskAssist>,
): UnifiedTask[] {
  const projectMap = new Map(projects.map((p) => [p.id, p.name]));

  const linearTasks: UnifiedTask[] = issues.map((issue) => {
    const groupId = parseTeamTaskGroupId(issue.description);
    const teamTask = groupId
      ? { groupId, assigneeUserIds: parseTeamTaskAssignees(issue.description) }
      : undefined;
    return {
      id: issue.id,
      kind: 'linear',
      title: issue.title,
      status: deriveLinearStatus(issue),
      dueDate: issue.dueDate ?? null,
      identifier: issue.identifier,
      priority: issue.priority,
      source: issue.source,
      project: null,
      teamTask,
      meta: metaByIssueId?.[issue.id] ?? null,
      assist: assistByIssueId?.[issue.id] ?? null,
    };
  });

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
    .filter((t) => t.status !== 'done' && t.status !== 'backlog')
    .sort((a, b) => {
      if (a.dueDate && b.dueDate) {
        const cmp = a.dueDate.localeCompare(b.dueDate);
        if (cmp !== 0) return cmp;
      } else if (a.dueDate) {
        return -1;
      } else if (b.dueDate) {
        return 1;
      }
      return prioRank(a.priority) - prioRank(b.priority);
    });
}

export function mergeBacklogTasks(
  steps: KpiWithWeek[],
  projects: KpiWithWeek[],
): UnifiedTask[] {
  const projectMap = new Map(projects.map((p) => [p.id, p.name]));
  return steps
    .filter((s) => s.type === 'step' && !s.completed && s.status === 'backlog')
    .map((step) => ({
      id: step.id,
      kind: 'step' as const,
      title: step.name,
      status: 'backlog' as UnifiedStatus,
      dueDate: step.due_date,
      project: step.parent_id
        ? { id: step.parent_id, name: projectMap.get(step.parent_id) ?? 'Projekt' }
        : null,
    }))
    .sort((a, b) => {
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return a.title.localeCompare(b.title);
    });
}

export function mergeDoneTasks(
  completedLinear: Array<{ id: string; identifier: string; title: string; completedAt: string }>,
  completedSteps: KpiWithWeek[],
  projects: KpiWithWeek[],
  limit = 3,
): UnifiedTask[] {
  const projectMap = new Map(projects.map((p) => [p.id, p.name]));

  const linearDone: UnifiedTask[] = completedLinear.map((issue) => ({
    id: issue.id,
    kind: 'linear',
    title: issue.title,
    status: 'done',
    dueDate: null,
    identifier: issue.identifier,
    completedAt: issue.completedAt,
    project: null,
  }));

  const stepDone: UnifiedTask[] = completedSteps
    .filter((s) => s.type === 'step' && s.completed)
    .map((step) => ({
      id: step.id,
      kind: 'step',
      title: step.name,
      status: 'done',
      dueDate: step.due_date,
      completedAt: step.completed_at ?? undefined,
      project: step.parent_id
        ? { id: step.parent_id, name: projectMap.get(step.parent_id) ?? 'Projekt' }
        : null,
    }));

  return [...linearDone, ...stepDone]
    .sort((a, b) => {
      if (!a.completedAt && !b.completedAt) return 0;
      if (!a.completedAt) return 1;
      if (!b.completedAt) return -1;
      return b.completedAt.localeCompare(a.completedAt);
    })
    .slice(0, limit);
}
