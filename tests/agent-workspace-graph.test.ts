import { describe, expect, it } from 'vitest';
import { buildAgentWorkspaceGraph, isRunnerSessionLive, repoNodeId } from '@/lib/agent-workspace-graph';
import type { AgentProjectWorkstream, AgentWorkstream } from '@/lib/agent-workstreams';
import type { AgentRunnerSession } from '@/types';

function runnerSession(overrides: Partial<AgentRunnerSession> = {}): AgentRunnerSession {
  return {
    id: 'runner-1',
    session_id: 'runner-1',
    terminal_session_id: 'runner-1',
    runtime: 'codex',
    status: 'running',
    title: 'KAL-153 - Terminal Map',
    cwd: 'C:\\Kalkulai\\kalkulai-team-os',
    linear_identifier: 'KAL-153',
    workstream: 'Team OS',
    branch: 'codex/agent-map',
    worktree_path: 'C:\\Kalkulai\\kalkulai-team-os',
    last_decision: null,
    current_state: null,
    next_decision: null,
    started_at: '2026-05-31T08:00:00.000Z',
    updated_at: '2026-05-31T08:10:00.000Z',
    exit_code: null,
    visibility: 'active',
    layout: null,
    repo_key: 'Team OS',
    task_id: null,
    parent_session_id: null,
    ...overrides,
  };
}

function workstream(overrides: Partial<AgentWorkstream> = {}): AgentWorkstream {
  return {
    id: 'workstream-1',
    kind: 'linear',
    title: 'Terminal Map',
    identifier: 'KAL-153',
    source: 'linear',
    sourceLabel: 'Linear',
    status: 'in-progress',
    statusLabel: 'In Progress',
    projectId: 'project-1',
    projectLabel: 'Agent Cockpit',
    dueDate: null,
    priority: 2,
    urgency: 'normal',
    urgencyLabel: 'Normal',
    repoLabel: 'Team OS',
    repoPath: 'C:\\Kalkulai\\kalkulai-team-os',
    stage: 'running',
    stageLabel: 'Running',
    progress: { done: 1, total: 3, pct: 33, label: '1 / 3' },
    activeSessions: [],
    runtimes: ['codex'],
    lastDecision: null,
    currentState: null,
    nextDecision: null,
    branch: null,
    worktreePath: null,
    linearUrl: null,
    ...overrides,
  };
}

function project(overrides: Partial<AgentProjectWorkstream> = {}): AgentProjectWorkstream {
  return {
    id: 'project-1',
    title: 'Agent Cockpit',
    dueDate: null,
    urgency: 'normal',
    urgencyLabel: 'Normal',
    repoLabel: 'Team OS',
    repoPath: 'C:\\Kalkulai\\kalkulai-team-os',
    stage: 'running',
    stageLabel: 'Running',
    progress: { done: 1, total: 3, pct: 33, label: '1 / 3' },
    activeSessions: [],
    ...overrides,
  };
}

describe('buildAgentWorkspaceGraph', () => {
  it('shows only live runner sessions as terminal nodes', () => {
    const graph = buildAgentWorkspaceGraph({
      runnerSessions: [
        runnerSession({ id: 'live', session_id: 'live', terminal_session_id: 'live', status: 'running' }),
        runnerSession({ id: 'done', session_id: 'done', terminal_session_id: 'done', status: 'done' }),
        runnerSession({ id: 'failed', session_id: 'failed', terminal_session_id: 'failed', status: 'failed' }),
      ],
      workstreams: [workstream()],
      projects: [project()],
    });

    expect(graph.activeSessions.map((session) => session.id)).toEqual(['live']);
    expect(graph.archivedSessions.map((session) => session.id)).toEqual(['done', 'failed']);
    expect(graph.nodes.filter((node) => node.type === 'terminal').map((node) => node.id)).toEqual(['terminal:live']);
  });

  it('creates repo nodes only for repos with active terminal sessions', () => {
    const graph = buildAgentWorkspaceGraph({
      runnerSessions: [
        runnerSession(),
        runnerSession({
          id: 'archived-marketplace',
          session_id: 'archived-marketplace',
          terminal_session_id: 'archived-marketplace',
          status: 'done',
          cwd: 'C:\\Kalkulai\\leon-marketplace',
          worktree_path: 'C:\\Kalkulai\\leon-marketplace',
          repo_key: 'marketplace',
          linear_identifier: null,
          task_id: null,
        }),
      ],
      workstreams: [workstream()],
      projects: [project()],
    });

    const repoNodes = graph.nodes.filter((node) => node.type === 'repo');
    expect(repoNodes).toHaveLength(1);
    expect(repoNodes[0].id).toBe(repoNodeId('C:\\Kalkulai\\kalkulai-team-os'));
    expect(repoNodes[0].data.label).toBe('Team OS · 1');
    expect(repoNodes[0].data.repoLabel).toBe('Team OS');
    expect(repoNodes[0].data.sessionCount).toBe(1);
    expect(repoNodes[0].data.pinned).toBe(false);
    expect(graph.edges).toEqual([
      expect.objectContaining({
        source: repoNodes[0].id,
        target: 'terminal:runner-1',
      }),
    ]);
    expect(graph.edges[0]).not.toHaveProperty('label');
  });

  it('strips visible issue ids from terminal labels', () => {
    const graph = buildAgentWorkspaceGraph({
      runnerSessions: [
        runnerSession({
          title: 'KAL-153 - Terminal Map cleanup',
          work_goal: 'Agent Cockpit',
          linear_identifier: null,
        }),
      ],
      workstreams: [],
      projects: [project()],
    });

    const terminal = graph.nodes.find((node) => node.type === 'terminal');
    expect(terminal?.data.runLabel).toBe('Terminal Map cleanup');
    expect(terminal?.data.workGoal).toBe('Agent Cockpit');
    expect(terminal?.data.displayTitle).toBe('Agent Cockpit · Terminal Map cleanup');
  });

  it('preserves persisted terminal layout for React Flow nodes', () => {
    const graph = buildAgentWorkspaceGraph({
      runnerSessions: [
        runnerSession({
          layout: { x: 220, y: 310, width: 720, height: 520 },
        }),
      ],
      workstreams: [workstream()],
      projects: [project()],
    });

    const terminal = graph.nodes.find((node) => node.type === 'terminal');
    expect(terminal).toEqual(expect.objectContaining({
      position: { x: 220, y: 310 },
      data: expect.objectContaining({
        layout: { x: 220, y: 310, width: 720, height: 520 },
      }),
    }));
  });

  it('carries pinned state from sessions to repo nodes', () => {
    const graph = buildAgentWorkspaceGraph({
      runnerSessions: [
        runnerSession({
          pinned: true,
        }),
      ],
      workstreams: [workstream()],
      projects: [project()],
    });

    const repo = graph.nodes.find((node) => node.type === 'repo');
    expect(repo?.data.pinned).toBe(true);
  });

  it('summarizes the active terminal queue without visible issue ids', () => {
    const graph = buildAgentWorkspaceGraph({
      runnerSessions: [
        runnerSession({
          title: 'Codex quick terminal',
          run_label: 'leer',
          queue: [
            { id: 'task-1', title: 'KAL-153 - Cockpit anschauen', status: 'active', repo_key: 'Team OS' },
            { id: 'task-2', title: 'KAL-154 - Follow up polish', status: 'queued', repo_key: 'Team OS' },
          ],
        }),
      ],
      workstreams: [],
      projects: [project()],
    });

    const terminal = graph.nodes.find((node) => node.type === 'terminal');
    expect(terminal?.data.activeQueueTitle).toBe('Cockpit anschauen');
    expect(terminal?.data.queuedTaskTitles).toEqual(['Follow up polish']);
    expect(terminal?.data.runLabel).toBe('Cockpit anschauen');
  });
});

describe('isRunnerSessionLive', () => {
  it('treats archived visibility as non-live even if status is running', () => {
    expect(isRunnerSessionLive(runnerSession({ status: 'running', visibility: 'archived' }))).toBe(false);
  });
});
