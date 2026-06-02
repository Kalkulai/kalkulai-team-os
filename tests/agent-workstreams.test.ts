import { describe, expect, it } from 'vitest';
import { buildAgentWorkstreamGroups, buildAgentWorkstreams, buildAgentProjectWorkstreams } from '@/lib/agent-workstreams';
import type { AgentActiveSessionSnapshot, KpiWithWeek, LinearIssue } from '@/types';

function issue(overrides: Partial<LinearIssue> = {}): LinearIssue {
  return {
    id: 'lin-1',
    identifier: 'KAL-1',
    title: 'Build cockpit',
    priority: 2,
    state: { name: 'Todo', type: 'unstarted' },
    assignee: null,
    dueDate: null,
    source: 'linear',
    labels: [],
    ...overrides,
  };
}

function kpi(overrides: Partial<KpiWithWeek> = {}): KpiWithWeek {
  return {
    id: 'kpi-1',
    user_id: 'leon',
    parent_id: null,
    name: 'Agent Cockpit',
    unit: '',
    position: 0,
    type: 'project',
    due_date: null,
    completed: false,
    created_at: '2026-01-01T00:00:00.000Z',
    source: 'manual',
    target: 0,
    actual: 0,
    ...overrides,
  };
}

function session(overrides: Partial<AgentActiveSessionSnapshot> = {}): AgentActiveSessionSnapshot {
  return {
    session_id: 'sid-1',
    user_id: 'leon',
    linear_identifier: null,
    title: 'Agent session',
    host: 'Laptop-Leon',
    cwd: 'C:\\Kalkulai\\kalkulai-team-os',
    runtime: 'codex',
    status: 'running',
    workstream: null,
    branch: null,
    worktree_path: null,
    terminal_session_id: 'term-1',
    last_decision: null,
    current_state: null,
    next_decision: null,
    started_at: '2026-05-31T08:00:00.000Z',
    last_seen_at: '2026-05-31T08:01:00.000Z',
    task_history: [],
    idle_minutes: 1,
    linear_url: null,
    ...overrides,
  };
}

describe('buildAgentWorkstreams', () => {
  it('uses unified Linear and KPI step tasks and preserves project progress', () => {
    const project = kpi({ id: 'proj-1', name: 'Team OS', type: 'project' });
    const openStep = kpi({ id: 'step-open', parent_id: 'proj-1', name: 'Wire terminal grid', type: 'step' });
    const doneStep = kpi({
      id: 'step-done',
      parent_id: 'proj-1',
      name: 'Create route',
      type: 'step',
      completed: true,
      completed_at: '2026-05-30T10:00:00.000Z',
    });

    const out = buildAgentWorkstreams({
      issues: [issue({ id: 'lin-7', identifier: 'KAL-7', title: 'Fix task launch' })],
      steps: [openStep, doneStep],
      projects: [project],
      sessions: [],
      now: new Date('2026-05-31T08:00:00.000Z'),
    });

    expect(out.map((w) => [w.kind, w.id, w.title])).toEqual([
      ['linear', 'lin-7', 'Fix task launch'],
      ['step', 'step-open', 'Wire terminal grid'],
    ]);
    expect(out.find((w) => w.id === 'step-open')).toEqual(expect.objectContaining({
      projectLabel: 'Team OS',
      progress: { done: 1, total: 2, pct: 50, label: '1 / 2' },
    }));
  });

  it('attaches sessions by Linear identifier and derives needs-leon stage', () => {
    const out = buildAgentWorkstreams({
      issues: [issue({ id: 'lin-153', identifier: 'KAL-153', title: 'Cross-session UI' })],
      steps: [],
      projects: [],
      sessions: [
        session({
          session_id: 'sid-blocked',
          terminal_session_id: 'term-blocked',
          linear_identifier: 'KAL-153',
          runtime: 'claude',
          status: 'blocked',
          next_decision: 'Choose target layout',
        }),
      ],
      now: new Date('2026-05-31T08:00:00.000Z'),
    });

    expect(out[0].activeSessions).toHaveLength(1);
    expect(out[0]).toEqual(expect.objectContaining({
      stage: 'needs-leon',
      stageLabel: 'Needs Leon',
      nextDecision: 'Choose target layout',
    }));
  });

  it('groups each workstream once with live and decision lanes first', () => {
    const live = issue({ id: 'live', identifier: 'KAL-10', dueDate: '2026-05-31' });
    const blocked = issue({ id: 'blocked', identifier: 'KAL-11', dueDate: '2026-05-31' });
    const step = kpi({ id: 'step-1', parent_id: 'proj-1', name: 'Project step', type: 'step', due_date: '2026-06-02' });
    const groups = buildAgentWorkstreamGroups(buildAgentWorkstreams({
      issues: [live, blocked],
      steps: [step],
      projects: [kpi({ id: 'proj-1', name: 'Product', type: 'project' })],
      sessions: [
        session({ linear_identifier: 'KAL-10', status: 'running' }),
        session({ session_id: 'sid-2', terminal_session_id: 'term-2', linear_identifier: 'KAL-11', status: 'blocked' }),
      ],
      now: new Date('2026-05-31T08:00:00.000Z'),
    }));

    expect(groups.map((g) => [g.id, g.items.map((item) => item.id)])).toEqual([
      ['live', ['live']],
      ['needs-leon', ['blocked']],
      ['projects', ['step-1']],
    ]);
  });

  it('does not mirror a project-level session onto every step in that project', () => {
    const project = kpi({ id: 'proj-live', name: 'Live Artifact Production', type: 'project' });
    const launchStep = kpi({
      id: 'step-launch',
      parent_id: 'proj-live',
      name: 'An die ersten Piloten rausgeben',
      type: 'step',
    });
    const otherStep = kpi({
      id: 'step-other',
      parent_id: 'proj-live',
      name: 'Alles durchtesten und prüfen',
      type: 'step',
    });

    const out = buildAgentWorkstreams({
      issues: [],
      steps: [launchStep, otherStep],
      projects: [project],
      sessions: [
        session({
          session_id: 'sid-project',
          terminal_session_id: 'term-project',
          title: 'An die ersten Piloten rausgeben',
          workstream: 'Live Artifact Production',
          status: 'running',
        }),
      ],
      now: new Date('2026-05-31T08:00:00.000Z'),
    });

    expect(out.find((workstream) => workstream.id === 'step-launch')).toEqual(expect.objectContaining({
      stage: 'running',
    }));
    expect(out.find((workstream) => workstream.id === 'step-other')).toEqual(expect.objectContaining({
      stage: 'queued',
      activeSessions: [],
    }));
  });

  it('does not keep completed sessions in the live group', () => {
    const groups = buildAgentWorkstreamGroups(buildAgentWorkstreams({
      issues: [issue({ id: 'done-item', identifier: 'KAL-12', title: 'Completed smoke' })],
      steps: [],
      projects: [],
      sessions: [
        session({
          linear_identifier: 'KAL-12',
          status: 'done',
        }),
      ],
      now: new Date('2026-05-31T08:00:00.000Z'),
    }));

    expect(groups.some((group) => group.id === 'live')).toBe(false);
    expect(groups.at(-1)).toEqual(expect.objectContaining({
      id: 'backlog',
      items: [expect.objectContaining({ id: 'done-item', stage: 'queued', activeSessions: [] })],
    }));
  });
});

describe('buildAgentProjectWorkstreams', () => {
  it('builds project launch targets with progress', () => {
    const out = buildAgentProjectWorkstreams({
      projects: [kpi({ id: 'proj-1', name: 'Team OS', type: 'project' })],
      steps: [
        kpi({ id: 's1', parent_id: 'proj-1', type: 'step', completed: true }),
        kpi({ id: 's2', parent_id: 'proj-1', type: 'step', completed: false }),
      ],
      sessions: [session({ workstream: 'Team OS', runtime: 'codex', status: 'running' })],
      now: new Date('2026-05-31T08:00:00.000Z'),
    });

    expect(out[0]).toEqual(expect.objectContaining({
      id: 'proj-1',
      title: 'Team OS',
      stage: 'running',
      progress: { done: 1, total: 2, pct: 50, label: '1 / 2' },
    }));
  });
});
