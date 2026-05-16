import { describe, it, expect } from 'vitest';
import { deriveLinearStatus, deriveStepStatus, mergeTasks } from '../lib/unified-tasks';
import type { LinearIssue, KpiWithWeek } from '@/types';

function makeIssue(overrides: Partial<LinearIssue> = {}): LinearIssue {
  return {
    id: 'lin-1',
    identifier: 'KAL-1',
    title: 'Test Issue',
    priority: 2,
    state: { name: 'Todo', type: 'unstarted' },
    assignee: null,
    dueDate: null,
    source: 'linear',
    ...overrides,
  };
}

function makeStep(overrides: Partial<KpiWithWeek> = {}): KpiWithWeek {
  return {
    id: 'step-1',
    user_id: 'u1',
    parent_id: 'proj-1',
    name: 'Test Step',
    unit: '',
    position: 0,
    type: 'step',
    due_date: null,
    completed: false,
    created_at: '2026-01-01T00:00:00Z',
    source: 'manual',
    target: 0,
    actual: 0,
    ...overrides,
  };
}

function makeProject(id = 'proj-1', name = 'Testprojekt'): KpiWithWeek {
  return {
    id,
    user_id: 'u1',
    parent_id: null,
    name,
    unit: '',
    position: 0,
    type: 'project',
    due_date: null,
    completed: false,
    created_at: '2026-01-01T00:00:00Z',
    source: 'manual',
    target: 0,
    actual: 0,
  };
}

const TODAY = new Date().toISOString().slice(0, 10);
const YESTERDAY = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const TOMORROW = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const IN_TWO_DAYS = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
const IN_THREE_DAYS = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);

describe('deriveLinearStatus', () => {
  it('completed → done', () => {
    expect(deriveLinearStatus(makeIssue({ state: { name: 'Done', type: 'completed' } }))).toBe('done');
  });
  it('cancelled → done', () => {
    expect(deriveLinearStatus(makeIssue({ state: { name: 'Cancelled', type: 'cancelled' } }))).toBe('done');
  });
  it('started → in-progress', () => {
    expect(deriveLinearStatus(makeIssue({ state: { name: 'In Progress', type: 'started' } }))).toBe('in-progress');
  });
  it('name Blocked → on-hold', () => {
    expect(deriveLinearStatus(makeIssue({ state: { name: 'Blocked', type: 'unstarted' } }))).toBe('on-hold');
  });
  it('name On Hold → on-hold', () => {
    expect(deriveLinearStatus(makeIssue({ state: { name: 'On Hold', type: 'unstarted' } }))).toBe('on-hold');
  });
  it('unstarted → todo', () => {
    expect(deriveLinearStatus(makeIssue({ state: { name: 'Todo', type: 'unstarted' } }))).toBe('todo');
  });
  it('backlog → todo', () => {
    expect(deriveLinearStatus(makeIssue({ state: { name: 'Backlog', type: 'backlog' } }))).toBe('todo');
  });
  it('triage → todo', () => {
    expect(deriveLinearStatus(makeIssue({ state: { name: 'Triage', type: 'triage' } }))).toBe('todo');
  });
});

describe('deriveStepStatus', () => {
  it('completed=true → done', () => {
    expect(deriveStepStatus(makeStep({ completed: true }))).toBe('done');
  });
  it('due_date yesterday → in-progress', () => {
    expect(deriveStepStatus(makeStep({ due_date: YESTERDAY }))).toBe('in-progress');
  });
  it('due_date today → in-progress', () => {
    expect(deriveStepStatus(makeStep({ due_date: TODAY }))).toBe('in-progress');
  });
  it('due_date tomorrow → todo', () => {
    expect(deriveStepStatus(makeStep({ due_date: TOMORROW }))).toBe('todo');
  });
  it('no due_date → todo', () => {
    expect(deriveStepStatus(makeStep({ due_date: null }))).toBe('todo');
  });
  it('completed overrides overdue', () => {
    expect(deriveStepStatus(makeStep({ completed: true, due_date: YESTERDAY }))).toBe('done');
  });
});

describe('mergeTasks', () => {
  it('done items are filtered out', () => {
    const issue = makeIssue({ state: { name: 'Done', type: 'completed' } });
    expect(mergeTasks([issue], [], [])).toHaveLength(0);
  });

  it('linear and step tasks both included', () => {
    const result = mergeTasks([makeIssue()], [makeStep()], [makeProject()]);
    expect(result).toHaveLength(2);
    expect(result.some((t) => t.kind === 'linear')).toBe(true);
    expect(result.some((t) => t.kind === 'step')).toBe(true);
  });

  it('project name attached to step', () => {
    const [task] = mergeTasks([], [makeStep({ parent_id: 'proj-1' })], [makeProject('proj-1', 'Mein Projekt')]);
    expect(task.project?.name).toBe('Mein Projekt');
  });

  it('step without matching project gets fallback', () => {
    const [task] = mergeTasks([], [makeStep({ parent_id: 'unknown' })], []);
    expect(task.project?.name).toBe('Projekt');
  });

  it('non-step kpis are ignored', () => {
    const counter: KpiWithWeek = { ...makeStep(), id: 'ctr-1', type: 'counter' };
    expect(mergeTasks([], [counter], [])).toHaveLength(0);
  });

  it('overdue sorts before future', () => {
    const future = makeIssue({ id: 'a', dueDate: TOMORROW, priority: 1 });
    const overdue = makeIssue({ id: 'b', dueDate: YESTERDAY, priority: 4 });
    const result = mergeTasks([future, overdue], [], []);
    expect(result[0].id).toBe('b');
  });

  it('same bucket: lower priority number sorts first', () => {
    const high = makeIssue({ id: 'a', priority: 1 });
    const low = makeIssue({ id: 'b', priority: 4 });
    const result = mergeTasks([low, high], [], []);
    expect(result[0].id).toBe('a');
  });

  it('linear and step with same id both present (no dedup)', () => {
    const issue = makeIssue({ id: 'shared-id' });
    const step = makeStep({ id: 'shared-id' });
    expect(mergeTasks([issue], [step], [])).toHaveLength(2);
  });
});

describe('mergeTasks — sort by exact dueDate', () => {
  it('earlier date sorts before later date within future', () => {
    const later = makeIssue({ id: 'b', dueDate: IN_THREE_DAYS, priority: 1 });
    const earlier = makeIssue({ id: 'a', dueDate: IN_TWO_DAYS, priority: 4 });
    const result = mergeTasks([later, earlier], [], []);
    expect(result[0].id).toBe('a');
  });

  it('task with due date sorts before task without', () => {
    const withDate = makeIssue({ id: 'a', dueDate: IN_TWO_DAYS });
    const noDate = makeIssue({ id: 'b', dueDate: null, priority: 1 });
    const result = mergeTasks([noDate, withDate], [], []);
    expect(result[0].id).toBe('a');
  });

  it('overdue (past) sorts before future date', () => {
    const future = makeIssue({ id: 'a', dueDate: TOMORROW, priority: 1 });
    const overdue = makeIssue({ id: 'b', dueDate: YESTERDAY, priority: 4 });
    const result = mergeTasks([future, overdue], [], []);
    expect(result[0].id).toBe('b');
  });

  it('same due date: lower priority number sorts first', () => {
    const low = makeIssue({ id: 'b', dueDate: TOMORROW, priority: 4 });
    const high = makeIssue({ id: 'a', dueDate: TOMORROW, priority: 1 });
    const result = mergeTasks([low, high], [], []);
    expect(result[0].id).toBe('a');
  });

  it('no date tasks sort by priority among themselves', () => {
    const lowPrio = makeIssue({ id: 'b', dueDate: null, priority: 4 });
    const highPrio = makeIssue({ id: 'a', dueDate: null, priority: 1 });
    const result = mergeTasks([lowPrio, highPrio], [], []);
    expect(result[0].id).toBe('a');
  });

  it('full ordering: past < present < future < no-date', () => {
    const noDate = makeIssue({ id: 'd', dueDate: null });
    const future = makeIssue({ id: 'c', dueDate: IN_TWO_DAYS });
    const today = makeIssue({ id: 'b', dueDate: TODAY });
    const overdue = makeIssue({ id: 'a', dueDate: YESTERDAY });
    const result = mergeTasks([noDate, future, today, overdue], [], []);
    expect(result.map((t) => t.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});
