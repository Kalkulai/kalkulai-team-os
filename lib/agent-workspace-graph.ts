import type { AgentRunQueueItem, AgentRunnerSession, AgentSessionLayout } from '@/types';
import {
  AGENT_REPOS,
  type AgentProjectWorkstream,
  type AgentWorkstream,
} from '@/lib/agent-workstreams';

export interface AgentWorkspaceGraph {
  nodes: AgentWorkspaceNode[];
  edges: AgentWorkspaceEdge[];
  activeSessions: AgentRunnerSession[];
  archivedSessions: AgentRunnerSession[];
}

export type AgentWorkspaceNode =
  | AgentWorkspaceRepoNode
  | AgentWorkspaceTerminalNode;

export interface AgentWorkspaceRepoNode {
  id: string;
  type: 'repo';
  position: { x: number; y: number };
  data: {
    label: string;
    repoLabel: string;
    repoPath: string;
    color: string;
    sessionCount: number;
    pinned: boolean;
  };
}

export interface AgentWorkspaceTerminalNode {
  id: string;
  type: 'terminal';
  position: { x: number; y: number };
  data: {
    session: AgentRunnerSession;
    repoLabel: string;
    repoPath: string;
    workstream: AgentWorkstream | null;
    layout: AgentSessionLayout;
    siblingCount: number;
    workGoal: string;
    runLabel: string;
    displayTitle: string;
    repoColor: string;
    activeQueueTitle: string | null;
    queuedTaskTitles: string[];
  };
}

export interface AgentWorkspaceEdge {
  id: string;
  source: string;
  target: string;
}

const DEFAULT_TERMINAL_WIDTH = 620;
const DEFAULT_TERMINAL_HEIGHT = 440;
const REPO_NODE_WIDTH = 150;
const REPO_COLORS = {
  'team-os': '#5B8CFF',
  operations: '#2DD4BF',
  '2nd-brain': '#A78BFA',
  hermes: '#F2B84B',
  kalkulai: '#38BDF8',
  marketplace: '#FB7185',
  fallback: '#94A3B8',
} as const;

export function buildAgentWorkspaceGraph({
  runnerSessions,
  workstreams,
}: {
  runnerSessions: AgentRunnerSession[];
  workstreams: AgentWorkstream[];
  projects: AgentProjectWorkstream[];
}): AgentWorkspaceGraph {
  const activeSessions = runnerSessions.filter(isRunnerSessionLive);
  const archivedSessions = runnerSessions.filter((session) => !isRunnerSessionLive(session));
  const repoBuckets = new Map<string, {
    repoLabel: string;
    repoPath: string;
    sessions: AgentRunnerSession[];
    pinned: boolean;
  }>();

  const terminalNodes: AgentWorkspaceTerminalNode[] = activeSessions.map((session, index) => {
    const workstream = findMatchingWorkstream(session, workstreams);
    const repo = repoForSession(session, workstream);
    const repoColorValue = repoColor(repo.label, repo.path);
    const queueSummary = summarizeQueue(session.queue);
    const workGoal = firstVisibleLabel([
      session.work_goal,
      workstream?.projectLabel,
      session.workstream,
      repo.label,
      'Run',
    ]);
    const runLabel = firstVisibleLabel([
      visibleRunLabel(session.run_label),
      queueSummary.activeTitle,
      workstream?.title,
      session.title,
      'leer',
    ]);
    const bucket = repoBuckets.get(repo.path) ?? {
      repoLabel: repo.label,
      repoPath: repo.path,
      sessions: [],
      pinned: false,
    };
    bucket.sessions.push(session);
    bucket.pinned = bucket.pinned || Boolean(session.pinned);
    repoBuckets.set(repo.path, bucket);

    const layout = normalizeLayout(session.layout, index);
    return {
      id: terminalNodeId(session.id),
      type: 'terminal',
      position: { x: layout.x, y: layout.y },
      data: {
        session,
        repoLabel: repo.label,
        repoPath: repo.path,
        workstream,
        layout,
        siblingCount: 1,
        workGoal,
        runLabel,
        displayTitle: displayTitle(workGoal, runLabel),
        repoColor: repoColorValue,
        activeQueueTitle: queueSummary.activeTitle,
        queuedTaskTitles: queueSummary.queuedTitles,
      },
    };
  });

  const repoOrder = [...repoBuckets.values()].sort((a, b) => a.repoLabel.localeCompare(b.repoLabel));
  const repoNodes: AgentWorkspaceRepoNode[] = repoOrder.map((bucket, index) => ({
    id: repoNodeId(bucket.repoPath),
    type: 'repo',
    position: { x: 36 + index * (REPO_NODE_WIDTH + 28), y: 36 },
    data: {
      label: `${bucket.repoLabel} · ${bucket.sessions.length}`,
      repoLabel: bucket.repoLabel,
      repoPath: bucket.repoPath,
      color: repoColor(bucket.repoLabel, bucket.repoPath),
      sessionCount: bucket.sessions.length,
      pinned: bucket.pinned,
    },
  }));

  const sessionCountsByRepo = new Map(repoOrder.map((bucket) => [bucket.repoPath, bucket.sessions.length]));
  const edges: AgentWorkspaceEdge[] = terminalNodes.map((node) => {
    node.data.siblingCount = sessionCountsByRepo.get(node.data.repoPath) ?? 1;
    return {
      id: `edge:${node.data.repoPath}:${node.data.session.id}`,
      source: repoNodeId(node.data.repoPath),
      target: node.id,
    };
  });

  return {
    nodes: [...repoNodes, ...terminalNodes],
    edges,
    activeSessions,
    archivedSessions,
  };
}

export function isRunnerSessionLive(session: AgentRunnerSession): boolean {
  if (session.visibility === 'archived') return false;
  return session.status !== 'done' && session.status !== 'failed';
}

export function terminalNodeId(sessionId: string): string {
  return `terminal:${sessionId}`;
}

export function repoNodeId(repoPath: string): string {
  return `repo:${normalizePath(repoPath)}`;
}

export function stripVisibleIds(value: string): string {
  return value
    .replace(/\b[A-Z]+-\d+\b\s*(?:[-:–—]\s*)?/g, '')
    .replace(/\s*(?:[-:–—]\s*)\b[A-Z]+-\d+\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function repoColor(repoLabel: string, repoPath = ''): string {
  const text = `${repoLabel} ${repoPath}`.toLowerCase();
  if (text.includes('team-os') || text.includes('team os')) return REPO_COLORS['team-os'];
  if (text.includes('operations')) return REPO_COLORS.operations;
  if (text.includes('2nd-brain') || text.includes('2nd brain')) return REPO_COLORS['2nd-brain'];
  if (text.includes('hermes')) return REPO_COLORS.hermes;
  if (text.includes('kalkulai') || text.includes('kalkulai app')) return REPO_COLORS.kalkulai;
  if (text.includes('marketplace')) return REPO_COLORS.marketplace;
  return REPO_COLORS.fallback;
}

function normalizeLayout(layout: AgentSessionLayout | null | undefined, index: number): AgentSessionLayout {
  if (
    layout &&
    Number.isFinite(layout.x) &&
    Number.isFinite(layout.y) &&
    Number.isFinite(layout.width) &&
    Number.isFinite(layout.height)
  ) {
    return {
      x: layout.x,
      y: layout.y,
      width: Math.max(420, layout.width),
      height: Math.max(300, layout.height),
    };
  }
  return {
    x: 56 + (index % 2) * 660,
    y: 188 + Math.floor(index / 2) * 480,
    width: DEFAULT_TERMINAL_WIDTH,
    height: DEFAULT_TERMINAL_HEIGHT,
  };
}

function findMatchingWorkstream(session: AgentRunnerSession, workstreams: AgentWorkstream[]): AgentWorkstream | null {
  if (session.task_id) {
    const byTaskId = workstreams.find((workstream) => workstream.id === session.task_id);
    if (byTaskId) return byTaskId;
  }
  if (session.linear_identifier) {
    const byIdentifier = workstreams.find((workstream) => workstream.identifier === session.linear_identifier);
    if (byIdentifier) return byIdentifier;
  }
  const haystack = `${session.title} ${session.workstream ?? ''}`.toLowerCase();
  return workstreams.find((workstream) => {
    const title = workstream.title.toLowerCase();
    const project = workstream.projectLabel.toLowerCase();
    return haystack.includes(title) || haystack.includes(project);
  }) ?? null;
}

function repoForSession(session: AgentRunnerSession, workstream: AgentWorkstream | null) {
  if (workstream) {
    return { label: workstream.repoLabel, path: workstream.repoPath };
  }
  const byPath = AGENT_REPOS.find((repo) =>
    pathBelongsToRepo(session.cwd, repo.path) || pathBelongsToRepo(session.worktree_path, repo.path),
  );
  if (byPath) return byPath;
  const text = `${session.title} ${session.workstream ?? ''} ${session.repo_key ?? ''}`.toLowerCase();
  return AGENT_REPOS.find((repo) =>
    repo.keywords.some((keyword) => text.includes(keyword.toLowerCase())) ||
    text.includes(repo.label.toLowerCase()),
  ) ?? AGENT_REPOS[0];
}

function firstVisibleLabel(values: Array<string | null | undefined>): string {
  for (const value of values) {
    const label = stripVisibleIds(value ?? '');
    if (label) return label;
  }
  return '';
}

function visibleRunLabel(value: string | null | undefined): string | null {
  const label = stripVisibleIds(value ?? '');
  return label && label.toLowerCase() !== 'leer' ? label : null;
}

function summarizeQueue(queue: AgentRunQueueItem[] | null | undefined) {
  const items = Array.isArray(queue) ? queue : [];
  const activeItem = items.find((item) => item.status === 'active') ??
    items.find((item) => item.status !== 'done' && item.status !== 'blocked');
  const activeTitle = cleanQueueTitle(activeItem);
  const queuedTitles = items
    .filter((item) => item.id !== activeItem?.id && item.status === 'queued')
    .map(cleanQueueTitle)
    .filter((title): title is string => Boolean(title))
    .slice(0, 4);
  return { activeTitle, queuedTitles };
}

function cleanQueueTitle(item: AgentRunQueueItem | null | undefined) {
  if (!item?.title) return null;
  return stripVisibleIds(item.title) || item.title;
}

function displayTitle(workGoal: string, runLabel: string): string {
  if (workGoal && runLabel) return `${workGoal} · ${runLabel}`;
  return workGoal || runLabel;
}

function pathBelongsToRepo(value: string | null | undefined, repoPath: string): boolean {
  if (!value) return false;
  const path = normalizePath(value);
  const repo = normalizePath(repoPath);
  return path === repo || path.startsWith(`${repo}\\`);
}

function normalizePath(value: string): string {
  return value.replace(/\//g, '\\').replace(/\\+$/g, '').toLowerCase();
}
