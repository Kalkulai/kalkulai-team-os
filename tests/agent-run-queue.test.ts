import { describe, expect, it } from 'vitest';
import {
  addWorkstreamToRunQueue,
  advanceRunQueueAfterDone,
  buildProjectRunQueue,
  buildTaskRunQueue,
  queueToPlanSteps,
} from '@/lib/agent-run-queue';
import type { AgentWorkstream } from '@/lib/agent-workstreams';
import type { AgentRunQueueItem } from '@/types';

function workstream(overrides: Partial<AgentWorkstream> = {}): AgentWorkstream {
  return {
    id: 'task-1',
    kind: 'linear',
    title: 'KAL-153 - Cockpit anschauen',
    identifier: 'KAL-153',
    source: 'linear',
    sourceLabel: 'Linear',
    status: 'todo',
    statusLabel: 'To Do',
    projectId: 'project-1',
    projectLabel: 'Team OS',
    dueDate: null,
    priority: 2,
    urgency: 'normal',
    urgencyLabel: 'Normal',
    repoLabel: 'Team OS',
    repoPath: 'C:\\Kalkulai\\kalkulai-team-os',
    stage: 'queued',
    stageLabel: 'Queued',
    progress: { done: 0, total: 3, pct: 0, label: '0 / 3' },
    activeSessions: [],
    runtimes: [],
    lastDecision: null,
    currentState: null,
    nextDecision: null,
    branch: null,
    worktreePath: null,
    linearUrl: null,
    ...overrides,
  };
}

describe('agent run queue helpers', () => {
  it('starts a task run with the selected task active and follow-up project tasks queued', () => {
    const active = workstream();
    const next = workstream({
      id: 'task-2',
      title: 'KAL-154 - Inspector pruefen',
      identifier: 'KAL-154',
    });
    const done = workstream({
      id: 'task-3',
      title: 'KAL-155 - Alte Smoke Session',
      identifier: 'KAL-155',
      stage: 'done',
    });

    const queue = buildTaskRunQueue(active, [next, active, done]);

    expect(queue).toEqual([
      expect.objectContaining({
        id: 'task-1',
        title: 'Cockpit anschauen',
        repo_key: 'Team OS',
        status: 'active',
      }),
      expect.objectContaining({
        id: 'task-2',
        title: 'Inspector pruefen',
        status: 'queued',
      }),
    ]);
    expect(queueToPlanSteps(queue)).toEqual([
      { id: 'task-1', title: 'Cockpit anschauen', status: 'active' },
      { id: 'task-2', title: 'Inspector pruefen', status: 'todo' },
    ]);
  });

  it('builds a project queue from the next open project tasks only', () => {
    const first = workstream({ id: 'step-1', title: 'Ersten Schritt machen', kind: 'step' });
    const second = workstream({ id: 'step-2', title: 'Zweiten Schritt machen', kind: 'step' });
    const done = workstream({ id: 'step-3', title: 'Erledigten Schritt nicht zeigen', kind: 'step', stage: 'done' });

    expect(buildProjectRunQueue([done, first, second])).toEqual([
      expect.objectContaining({ id: 'step-1', status: 'active' }),
      expect.objectContaining({ id: 'step-2', status: 'queued' }),
    ]);
  });

  it('adds a dragged task to an existing queue without duplicates', () => {
    const existing: AgentRunQueueItem[] = [
      { id: 'task-1', title: 'Cockpit anschauen', repo_key: 'Team OS', status: 'active' },
    ];
    const next = workstream({ id: 'task-2', title: 'KAL-154 - Naechste Task' });

    expect(addWorkstreamToRunQueue(existing, next)).toEqual([
      existing[0],
      expect.objectContaining({ id: 'task-2', title: 'Naechste Task', status: 'queued' }),
    ]);
    expect(addWorkstreamToRunQueue(existing, workstream())).toEqual(existing);
  });

  it('advances to the next queued task after Leon confirms continue', () => {
    const queue: AgentRunQueueItem[] = [
      { id: 'task-1', title: 'Cockpit anschauen', repo_key: 'Team OS', status: 'active' },
      { id: 'task-2', title: 'Naechste Task', repo_key: 'Team OS', status: 'queued' },
    ];

    expect(advanceRunQueueAfterDone(queue)).toEqual([
      { id: 'task-1', title: 'Cockpit anschauen', repo_key: 'Team OS', status: 'done' },
      { id: 'task-2', title: 'Naechste Task', repo_key: 'Team OS', status: 'active' },
    ]);
  });
});
