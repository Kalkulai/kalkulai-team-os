import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { AgentActiveSessionSnapshot, AgentRuntime, KpiWithWeek, LinearIssue, TaskSource } from '@/types';
import { mergeTasks, type UnifiedTask } from '@/lib/unified-tasks';

export type AgentStage = 'queued' | 'running' | 'needs-leon' | 'review' | 'done' | 'failed';
export type WorkstreamUrgency = 'overdue' | 'today' | 'urgent' | 'high' | 'soon' | 'normal';

export interface AgentRepoTarget {
  label: string;
  path: string;
  keywords: string[];
}

export const AGENT_REPOS: AgentRepoTarget[] = [
  { label: 'Team OS', path: 'C:\\Kalkulai\\kalkulai-team-os', keywords: ['team-os', 'dashboard', 'kpi', 'session', 'cockpit'] },
  { label: 'KalkulAI App', path: 'C:\\Kalkulai\\kalkulai', keywords: ['quote', 'editor', 'kai-editor', 'frontend', 'backend', 'sprint'] },
  { label: 'Operations', path: 'C:\\Kalkulai\\kalkulai-operations', keywords: ['operations', 'partner', 'partnership', 'sales', 'reels'] },
  { label: 'Leon Marketplace', path: 'C:\\Kalkulai\\leon-marketplace', keywords: ['marketplace', 'setup', 'skill', 'mcp', 'claude', 'codex'] },
  { label: '2nd Brain', path: 'C:\\Kalkulai\\2nd-Brain', keywords: ['obsidian', 'brain', 'notes', 'knowledge'] },
];

export interface AgentProgress {
  done: number;
  total: number;
  pct: number;
  label: string;
}

export interface AgentWorkstream {
  id: string;
  kind: UnifiedTask['kind'];
  title: string;
  identifier?: string;
  source?: TaskSource;
  sourceLabel: string;
  status: UnifiedTask['status'];
  statusLabel: string;
  projectId: string | null;
  projectLabel: string;
  dueDate: string | null;
  priority: number;
  urgency: WorkstreamUrgency;
  urgencyLabel: string;
  repoLabel: string;
  repoPath: string;
  stage: AgentStage;
  stageLabel: string;
  progress: AgentProgress | null;
  activeSessions: AgentActiveSessionSnapshot[];
  runtimes: AgentRuntime[];
  lastDecision: string | null;
  currentState: string | null;
  nextDecision: string | null;
  branch: string | null;
  worktreePath: string | null;
  linearUrl: string | null;
}

export interface AgentProjectWorkstream {
  id: string;
  title: string;
  dueDate: string | null;
  urgency: WorkstreamUrgency;
  urgencyLabel: string;
  repoLabel: string;
  repoPath: string;
  stage: AgentStage;
  stageLabel: string;
  progress: AgentProgress;
  activeSessions: AgentActiveSessionSnapshot[];
}

export interface AgentWorkstreamGroup {
  id: 'live' | 'needs-leon' | 'today' | 'projects' | 'backlog';
  label: string;
  items: AgentWorkstream[];
}

export function buildAgentWorkstreams({
  issues,
  steps,
  projects,
  sessions,
  now = new Date(),
}: {
  issues: LinearIssue[];
  steps: KpiWithWeek[];
  projects: KpiWithWeek[];
  sessions: AgentActiveSessionSnapshot[];
  now?: Date;
}): AgentWorkstream[] {
  const unified = mergeTasks(issues, steps, projects);
  const progressByProject = buildProgressMap(projects, steps);

  return unified.map((task) => {
    const activeSessions = sessions
      .filter((session) => sessionMatchesTask(session, task))
      .filter(isOpenSession);
    const latest = pickLatestSession(activeSessions);
    const repo = repoForTask(task);
    const urgency = urgencyForTask(task, now);
    const stage = activeSessions.length ? stageForSessions(activeSessions) : task.status === 'done' ? 'done' : 'queued';
    return {
      id: task.id,
      kind: task.kind,
      title: task.title,
      identifier: task.identifier,
      source: task.source,
      sourceLabel: sourceLabel(task),
      status: task.status,
      statusLabel: statusLabel(task.status),
      projectId: task.project?.id ?? null,
      projectLabel: task.project?.name ?? inferProjectLabel(task, repo.label),
      dueDate: task.dueDate,
      priority: task.priority ?? 0,
      urgency,
      urgencyLabel: urgencyLabel(task, urgency),
      repoLabel: repo.label,
      repoPath: repo.path,
      stage,
      stageLabel: stageLabel(stage),
      progress: task.project?.id ? progressByProject.get(task.project.id) ?? null : null,
      activeSessions,
      runtimes: uniqueRuntimes(activeSessions),
      lastDecision: latest?.last_decision ?? null,
      currentState: latest?.current_state ?? null,
      nextDecision: latest?.next_decision ?? null,
      branch: latest?.branch ?? null,
      worktreePath: latest?.worktree_path ?? null,
      linearUrl: latest?.linear_url ?? null,
    };
  });
}

export function buildAgentProjectWorkstreams({
  projects,
  steps,
  sessions,
  now = new Date(),
}: {
  projects: KpiWithWeek[];
  steps: KpiWithWeek[];
  sessions: AgentActiveSessionSnapshot[];
  now?: Date;
}): AgentProjectWorkstream[] {
  const progressByProject = buildProgressMap(projects, steps);
  return projects
    .filter((project) => project.type === 'project')
    .map((project) => {
      const activeSessions = sessions
        .filter((session) => sessionMatchesProject(session, project))
        .filter(isOpenSession);
      const repo = repoForText(project.name);
      const urgency = urgencyForDate(project.due_date, now);
      const progress = progressByProject.get(project.id) ?? { done: 0, total: 0, pct: 0, label: '0 / 0' };
      const stage = activeSessions.length ? stageForSessions(activeSessions) : progress.total > 0 && progress.done === progress.total ? 'done' : 'queued';
      return {
        id: project.id,
        title: project.name,
        dueDate: project.due_date,
        urgency,
        urgencyLabel: project.due_date ? dateUrgencyLabel(project.due_date, urgency) : 'Kein Deadline',
        repoLabel: repo.label,
        repoPath: repo.path,
        stage,
        stageLabel: stageLabel(stage),
        progress,
        activeSessions,
      };
    })
    .sort((a, b) => urgencyRank(a.urgency) - urgencyRank(b.urgency) || a.title.localeCompare(b.title));
}

export function buildAgentWorkstreamGroups(workstreams: AgentWorkstream[]): AgentWorkstreamGroup[] {
  const seen = new Set<string>();
  const groups: AgentWorkstreamGroup[] = [
    { id: 'live', label: 'Live', items: [] },
    { id: 'needs-leon', label: 'Needs Leon', items: [] },
    { id: 'today', label: 'Heute / Überfällig', items: [] },
    { id: 'projects', label: 'Projekte', items: [] },
    { id: 'backlog', label: 'Backlog', items: [] },
  ];

  function add(groupId: AgentWorkstreamGroup['id'], item: AgentWorkstream) {
    if (seen.has(item.id)) return;
    groups.find((group) => group.id === groupId)?.items.push(item);
    seen.add(item.id);
  }

  for (const item of workstreams) {
    if (hasOpenSession(item) && item.stage !== 'needs-leon') add('live', item);
  }
  for (const item of workstreams) {
    if (item.stage === 'needs-leon') add('needs-leon', item);
  }
  for (const item of workstreams) {
    if (item.urgency === 'overdue' || item.urgency === 'today' || item.urgency === 'urgent') add('today', item);
  }
  for (const item of workstreams) {
    if (item.kind === 'step' || item.progress) add('projects', item);
  }
  for (const item of workstreams) add('backlog', item);

  return groups.filter((group) => group.items.length > 0);
}

function hasOpenSession(item: AgentWorkstream): boolean {
  return item.activeSessions.some(isOpenSession);
}

function isOpenSession(session: AgentActiveSessionSnapshot): boolean {
  return session.status !== 'done' && session.status !== 'failed';
}

function buildProgressMap(projects: KpiWithWeek[], steps: KpiWithWeek[]): Map<string, AgentProgress> {
  const projectIds = new Set(projects.filter((project) => project.type === 'project').map((project) => project.id));
  const map = new Map<string, AgentProgress>();
  for (const projectId of projectIds) {
    const projectSteps = steps.filter((step) => step.type === 'step' && step.parent_id === projectId);
    const total = projectSteps.length;
    const done = projectSteps.filter((step) => step.completed).length;
    map.set(projectId, {
      done,
      total,
      pct: total > 0 ? Math.round((done / total) * 100) : 0,
      label: `${done} / ${total}`,
    });
  }
  return map;
}

function sessionMatchesTask(session: AgentActiveSessionSnapshot, task: UnifiedTask): boolean {
  if (task.identifier && session.linear_identifier === task.identifier) return true;
  const title = session.title?.toLowerCase() ?? '';
  const taskTitle = task.title.toLowerCase();
  return Boolean(title && (title.includes(taskTitle) || taskTitle.includes(title)));
}

function sessionMatchesProject(session: AgentActiveSessionSnapshot, project: KpiWithWeek): boolean {
  const projectName = project.name.toLowerCase();
  return (session.workstream?.toLowerCase() === projectName) || (session.title?.toLowerCase().includes(projectName) ?? false);
}

function pickLatestSession(sessions: AgentActiveSessionSnapshot[]): AgentActiveSessionSnapshot | null {
  return [...sessions].sort((a, b) => b.last_seen_at.localeCompare(a.last_seen_at))[0] ?? null;
}

function uniqueRuntimes(sessions: AgentActiveSessionSnapshot[]): AgentRuntime[] {
  return Array.from(new Set(sessions.map((session) => session.runtime)));
}

function stageForSessions(sessions: AgentActiveSessionSnapshot[]): AgentStage {
  if (sessions.some((session) => session.status === 'blocked')) return 'needs-leon';
  if (sessions.some((session) => session.status === 'failed')) return 'failed';
  if (sessions.some((session) => session.status === 'review')) return 'review';
  if (sessions.some((session) => session.status === 'running' || session.status === 'idle')) return 'running';
  if (sessions.some((session) => session.status === 'done')) return 'done';
  return 'queued';
}

function stageLabel(stage: AgentStage): string {
  return {
    queued: 'Queued',
    running: 'Running',
    'needs-leon': 'Needs Leon',
    review: 'Review',
    done: 'Done',
    failed: 'Failed',
  }[stage];
}

function statusLabel(status: UnifiedTask['status']): string {
  return {
    todo: 'To Do',
    'in-progress': 'In Progress',
    'on-hold': 'On Hold',
    done: 'Done',
    backlog: 'Backlog',
  }[status];
}

function sourceLabel(task: UnifiedTask): string {
  if (task.kind === 'step') return 'Project Step';
  return task.source === 'hermes' ? 'Hermes' : task.source === 'notion' ? 'Notion' : task.source === 'local' ? 'Local' : 'Linear';
}

function inferProjectLabel(task: UnifiedTask, repoLabel: string): string {
  const text = `${task.title} ${task.identifier ?? ''}`.toLowerCase();
  if (/security|auth|rls|pii|dsgvo|critical|risk/.test(text)) return 'Security / Risk';
  if (/sales|partner|partnership|reel|operations/.test(text)) return 'Operations / Growth';
  if (/marketplace|skill|mcp|setup|claude|codex|agent|browser/.test(text)) return 'Agent Infrastructure';
  if (/team-os|dashboard|kpi|kanban|session|cockpit/.test(text)) return 'Team OS';
  if (/sprint|kai-editor|quote|frontend|backend|editor/.test(text)) return 'KalkulAI Product';
  return repoLabel;
}

function repoForTask(task: UnifiedTask): AgentRepoTarget {
  return repoForText(`${task.title} ${task.identifier ?? ''} ${task.project?.name ?? ''} ${task.source ?? ''}`);
}

function repoForText(text: string): AgentRepoTarget {
  const lower = text.toLowerCase();
  return AGENT_REPOS.find((repo) => repo.keywords.some((keyword) => lower.includes(keyword))) ?? AGENT_REPOS[1];
}

function urgencyForTask(task: UnifiedTask, now: Date): WorkstreamUrgency {
  const byDate = urgencyForDate(task.dueDate, now);
  if (byDate === 'overdue' || byDate === 'today' || byDate === 'soon') return byDate;
  if ((task.priority ?? 0) <= 1 && (task.priority ?? 0) > 0) return 'urgent';
  if (task.priority === 2) return 'high';
  return byDate;
}

function urgencyForDate(date: string | null | undefined, now: Date): WorkstreamUrgency {
  if (!date) return 'normal';
  try {
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const due = parseISO(date);
    due.setHours(0, 0, 0, 0);
    const days = differenceInCalendarDays(due, today);
    if (days < 0) return 'overdue';
    if (days === 0) return 'today';
    if (days <= 3) return 'soon';
  } catch {
    return 'normal';
  }
  return 'normal';
}

function urgencyLabel(task: UnifiedTask, urgency: WorkstreamUrgency): string {
  if (urgency === 'urgent') return 'P1';
  if (urgency === 'high') return 'P2';
  if (task.dueDate) return dateUrgencyLabel(task.dueDate, urgency);
  return 'Normal';
}

function dateUrgencyLabel(date: string, urgency: WorkstreamUrgency): string {
  if (urgency === 'overdue') return 'Überfällig';
  if (urgency === 'today') return 'Heute';
  return `Due ${formatShortDate(date)}`;
}

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' }).format(new Date(value));
}

function urgencyRank(urgency: WorkstreamUrgency): number {
  return { overdue: 0, today: 1, urgent: 2, high: 3, soon: 4, normal: 5 }[urgency];
}
