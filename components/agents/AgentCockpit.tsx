'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  Check,
  ChevronDown,
  GitBranch,
  ListChecks,
  Play,
  Plus,
  RefreshCw,
  Search,
  SquareTerminal,
  X,
} from 'lucide-react';
import type {
  AgentActiveSessionSnapshot,
  AgentRunnerSession,
  AgentRuntime,
  AgentSessionLayout,
} from '@/types';
import {
  AGENT_REPOS,
  type AgentProjectWorkstream,
  type AgentStage,
  type AgentWorkstream,
} from '@/lib/agent-workstreams';
import {
  buildAgentWorkspaceGraph,
  isRunnerSessionLive,
  stripVisibleIds,
} from '@/lib/agent-workspace-graph';
import {
  addWorkstreamToRunQueue,
  advanceRunQueueAfterDone,
  buildProjectRunQueue,
  buildTaskRunQueue,
  queueToPlanSteps,
} from '@/lib/agent-run-queue';
import { AgentTerminalMap } from '@/components/agents/AgentTerminalMap';
import { AgentRunInspector } from '@/components/agents/AgentRunInspector';
import { AgentStartRunMenu } from '@/components/agents/AgentStartRunMenu';

const RUNNER_BASE = 'http://127.0.0.1:3217';
const RUNNER_TOKEN = process.env.NEXT_PUBLIC_AGENT_RUNNER_TOKEN ?? '';

type Runtime = Extract<AgentRuntime, 'claude' | 'codex' | 'shell'>;
type RunnerCapabilities = Record<Runtime, boolean>;
type LaunchMode = 'task' | 'project' | 'quick';
type RunnerSafety = {
  ui_reload_preserves_sessions: boolean;
  runner_restart_preserves_processes: boolean;
  active_sessions: number;
  note?: string;
};

interface ProjectTaskGroup {
  id: string;
  title: string;
  repoLabel: string;
  urgencyLabel: string;
  progress: AgentProjectWorkstream['progress'] | null;
  items: AgentWorkstream[];
}

const DEFAULT_CAPABILITIES: RunnerCapabilities = {
  claude: false,
  codex: true,
  shell: true,
};

const RUNTIME_OPTIONS: Array<{
  id: Runtime;
  label: string;
  glyph: string;
  fit: string;
}> = [
  { id: 'codex', label: 'Codex', glyph: 'Cx', fit: 'Implementation, Review, UI, Tests' },
  { id: 'claude', label: 'Claude Code', glyph: 'Cl', fit: 'Orchestration, context, Team-OS' },
  { id: 'shell', label: 'Shell', glyph: '$', fit: 'Debugging, Git, scripts' },
];

export function AgentCockpit({
  memberId,
  workstreams,
  projectWorkstreams,
}: {
  memberId: string;
  workstreams: AgentWorkstream[];
  projectWorkstreams: AgentProjectWorkstream[];
}) {
  const [runnerOnline, setRunnerOnline] = useState(false);
  const [runnerStatus, setRunnerStatus] = useState('Runner offline');
  const [runnerSafety, setRunnerSafety] = useState<RunnerSafety | null>(null);
  const [capabilities, setCapabilities] = useState<RunnerCapabilities>(DEFAULT_CAPABILITIES);
  const [runnerSessions, setRunnerSessions] = useState<AgentRunnerSession[]>([]);
  const [archivedSessions, setArchivedSessions] = useState<AgentRunnerSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [selectedWorkstreamId, setSelectedWorkstreamId] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState(projectWorkstreams[0]?.id ?? '');
  const [workstreamSearch, setWorkstreamSearch] = useState('');
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [startMenuOpen, setStartMenuOpen] = useState(false);
  const [launchMode, setLaunchMode] = useState<LaunchMode>('task');
  const [runtime, setRuntime] = useState<Runtime>('codex');
  const [cwd, setCwd] = useState(AGENT_REPOS[0]?.path ?? 'C:\\Kalkulai');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [workstreamDrawerOpen, setWorkstreamDrawerOpen] = useState(false);
  const [contextPanelOpen, setContextPanelOpen] = useState(false);
  const [archiveDrawerOpen, setArchiveDrawerOpen] = useState(false);
  const startRunButtonRef = useRef<HTMLButtonElement>(null);

  const refreshRunner = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setRefreshing(true);
    try {
      const health = await fetch(`${RUNNER_BASE}/health`, { cache: 'no-store', headers: runnerHeaders() });
      if (!health.ok) throw new Error('Runner health failed');
      const healthPayload = await health.json() as {
        message?: string;
        active_sessions?: number;
        safety?: Partial<RunnerSafety>;
        capabilities?: Partial<RunnerCapabilities>;
      };
      setRunnerOnline(true);
      setRunnerStatus(healthPayload.message ?? 'Runner live');
      setRunnerSafety({
        ui_reload_preserves_sessions: healthPayload.safety?.ui_reload_preserves_sessions ?? true,
        runner_restart_preserves_processes: healthPayload.safety?.runner_restart_preserves_processes ?? false,
        active_sessions: Number(healthPayload.safety?.active_sessions ?? healthPayload.active_sessions ?? 0),
        note: healthPayload.safety?.note,
      });
      setCapabilities({
        shell: healthPayload.capabilities?.shell ?? true,
        codex: healthPayload.capabilities?.codex ?? false,
        claude: healthPayload.capabilities?.claude ?? false,
      });

      const sessionsResponse = await fetch(`${RUNNER_BASE}/sessions`, { cache: 'no-store', headers: runnerHeaders() });
      if (!sessionsResponse.ok) throw new Error('Runner sessions failed');
      const sessionsPayload = await sessionsResponse.json() as { sessions?: AgentRunnerSession[] };
      setRunnerSessions((Array.isArray(sessionsPayload.sessions) ? sessionsPayload.sessions : []).filter(isRunnerSessionLive));
    } catch {
      setRunnerOnline(false);
      setRunnerStatus('Runner offline');
      setRunnerSafety(null);
      setRunnerSessions([]);
    } finally {
      if (!options?.silent) setRefreshing(false);
      setLastRefresh(new Intl.DateTimeFormat('de-DE', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date()));
    }
  }, []);

  const refreshArchive = useCallback(async () => {
    if (!runnerOnline) {
      setArchivedSessions([]);
      return;
    }
    const response = await fetch(`${RUNNER_BASE}/sessions?include=archived`, { cache: 'no-store', headers: runnerHeaders() }).catch(() => null);
    if (!response?.ok) {
      setArchivedSessions([]);
      return;
    }
    const payload = await response.json() as { sessions?: AgentRunnerSession[] };
    setArchivedSessions(Array.isArray(payload.sessions) ? payload.sessions : []);
  }, [runnerOnline]);

  useEffect(() => {
    const kickoff = window.setTimeout(() => void refreshRunner(), 0);
    const timer = window.setInterval(() => void refreshRunner({ silent: true }), 5000);
    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(timer);
    };
  }, [refreshRunner]);

  const filteredWorkstreams = useMemo(() => {
    const query = workstreamSearch.trim().toLowerCase();
    const openWorkstreams = workstreams.filter((workstream) => workstream.stage !== 'done');
    if (!query) return openWorkstreams;
    return openWorkstreams.filter((workstream) => {
      const haystack = [
        workstream.identifier,
        workstream.title,
        workstream.projectLabel,
        workstream.repoLabel,
        workstream.sourceLabel,
        workstream.stageLabel,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [workstreamSearch, workstreams]);

  const projectTaskGroups = useMemo(
    () => buildProjectTaskGroups(filteredWorkstreams, projectWorkstreams),
    [filteredWorkstreams, projectWorkstreams],
  );
  const focusWorkstreams = useMemo(
    () => buildFocusWorkstreams(filteredWorkstreams),
    [filteredWorkstreams],
  );

  const selectedRunnerSession = useMemo(
    () => runnerSessions.find((session) => session.id === selectedSessionId) ?? null,
    [runnerSessions, selectedSessionId],
  );

  const selectedWorkstream = useMemo(() => {
    const explicit = workstreams.find((workstream) => workstream.id === selectedWorkstreamId);
    if (explicit) return explicit;
    if (!selectedRunnerSession) return null;
    return workstreams.find((workstream) => runnerSessionMatchesWorkstream(selectedRunnerSession, workstream)) ?? null;
  }, [selectedRunnerSession, selectedWorkstreamId, workstreams]);

  const selectedProject = useMemo(
    () => projectWorkstreams.find((project) => project.id === selectedProjectId) ?? projectWorkstreams[0] ?? null,
    [projectWorkstreams, selectedProjectId],
  );

  const selectedProjectTaskGroup = useMemo(() => {
    if (selectedWorkstream) {
      return projectTaskGroups.find((group) => group.items.some((item) => item.id === selectedWorkstream.id)) ?? null;
    }
    if (selectedProject) {
      return projectTaskGroups.find((group) => group.id === selectedProject.id || group.title === selectedProject.title) ?? null;
    }
    return null;
  }, [projectTaskGroups, selectedProject, selectedWorkstream]);

  const graph = useMemo(() => buildAgentWorkspaceGraph({
    runnerSessions,
    workstreams,
    projects: projectWorkstreams,
  }), [projectWorkstreams, runnerSessions, workstreams]);

  const activeRunsCount = runnerSessions.length;
  const activeRunnerProcessCount = runnerSafety?.active_sessions ?? runnerSessions.length;
  const needsLeonCount = workstreams.filter((workstream) => workstream.stage === 'needs-leon').length;
  const urgentCount = workstreams.filter((workstream) => (
    workstream.stage !== 'done' &&
    (workstream.urgency === 'overdue' || workstream.urgency === 'today' || workstream.urgency === 'urgent')
  )).length;

  const selectWorkstream = useCallback((workstream: AgentWorkstream) => {
    setSelectedWorkstreamId(workstream.id);
    setCwd(workstream.worktreePath ?? workstream.repoPath);
    const runnerSession = runnerSessions.find((session) => runnerSessionMatchesWorkstream(session, workstream));
    if (runnerSession) {
      setSelectedSessionId(runnerSession.id);
      setContextPanelOpen(true);
    }
  }, [runnerSessions]);

  const selectProject = useCallback((project: AgentProjectWorkstream) => {
    setSelectedProjectId(project.id);
    setCwd(project.repoPath);
  }, []);

  const selectSession = useCallback((id: string) => {
    setSelectedSessionId(id);
    setContextPanelOpen(true);
  }, []);

  const openArchiveDrawer = useCallback(() => {
    setArchiveDrawerOpen(true);
    void refreshArchive();
  }, [refreshArchive]);

  const openTaskLauncher = useCallback(() => {
    setStartMenuOpen(false);
    setLaunchMode('task');
    setLauncherOpen(true);
  }, []);

  const openQuickTerminalLauncher = useCallback(() => {
    setStartMenuOpen(false);
    setLaunchMode('quick');
    setSelectedWorkstreamId('');
    setLauncherOpen(true);
  }, []);

  const patchRunnerSession = useCallback(async (id: string, patch: Partial<AgentRunnerSession>) => {
    await fetch(`${RUNNER_BASE}/sessions/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: runnerHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(patch),
    }).catch(() => {});
  }, []);

  const sendSessionInput = useCallback(async (id: string, data: string) => {
    await fetch(`${RUNNER_BASE}/sessions/${encodeURIComponent(id)}/input`, {
      method: 'POST',
      headers: runnerHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ data }),
    }).catch(() => {});
  }, []);

  const mergeRunnerSessionPatch = useCallback((id: string, patch: Partial<AgentRunnerSession>) => {
    setRunnerSessions((previous) => previous.map((session) => (
      session.id === id
        ? { ...session, ...patch, updated_at: new Date().toISOString() }
        : session
    )).filter(isRunnerSessionLive));
  }, []);

  const patchAndRefreshRunnerSession = useCallback((id: string, patch: Partial<AgentRunnerSession>) => {
    mergeRunnerSessionPatch(id, patch);
    void patchRunnerSession(id, patch).then(() => refreshRunner({ silent: true }));
  }, [mergeRunnerSessionPatch, patchRunnerSession, refreshRunner]);

  const updateLayout = useCallback((id: string, layout: AgentSessionLayout) => {
    mergeRunnerSessionPatch(id, { layout });
    void patchRunnerSession(id, { layout });
  }, [mergeRunnerSessionPatch, patchRunnerSession]);

  const confirmRunDone = useCallback((session: AgentRunnerSession) => {
    patchAndRefreshRunnerSession(session.id, {
      status: 'done',
      visibility: 'archived',
      done_pending: false,
      current_state: 'Done confirmed by Leon',
      next_decision: 'Archived',
    });
    setContextPanelOpen(false);
    setSelectedSessionId('');
  }, [patchAndRefreshRunnerSession]);

  const continueRun = useCallback((session: AgentRunnerSession) => {
    const nextQueue = advanceRunQueueAfterDone(session.queue);
    const activeItem = nextQueue.find((item) => item.status === 'active') ?? null;
    const activeWorkstream = activeItem ? workstreams.find((item) => item.id === activeItem.id) ?? null : null;
    patchAndRefreshRunnerSession(session.id, {
      status: 'running',
      queue: nextQueue,
      plan_steps: queueToPlanSteps(nextQueue),
      task_id: activeItem?.id ?? session.task_id,
      run_label: activeItem?.title ?? session.run_label,
      done_pending: false,
      current_state: 'Continuing after Leon confirmation',
      next_decision: activeItem
        ? `Weiter mit Queue-Task: ${activeItem.title}`
        : 'Keine naechste Queue-Task. Weiter prompten oder Session schließen.',
    });
    if (activeWorkstream && session.runtime !== 'shell') {
      void sendSessionInput(session.id, `${buildContinueQueuedWorkstreamPrompt(activeWorkstream)}\r`);
    }
    setSelectedSessionId(session.id);
    setContextPanelOpen(true);
  }, [patchAndRefreshRunnerSession, sendSessionInput, workstreams]);

  const archiveRun = useCallback((session: AgentRunnerSession) => {
    patchAndRefreshRunnerSession(session.id, {
      visibility: 'archived',
      done_pending: false,
      current_state: 'Session closed by Leon',
      next_decision: 'Archived',
    });
    setContextPanelOpen(false);
    setSelectedSessionId('');
  }, [patchAndRefreshRunnerSession]);

  const markRunReview = useCallback((session: AgentRunnerSession) => {
    patchAndRefreshRunnerSession(session.id, {
      status: 'review',
      done_pending: false,
      current_state: 'Ready for Leon review',
      next_decision: 'Review changes, decide merge/follow-up/close.',
    });
    setSelectedSessionId(session.id);
    setContextPanelOpen(true);
  }, [patchAndRefreshRunnerSession]);

  const confirmSelectedRunDone = useCallback(() => {
    if (selectedRunnerSession) confirmRunDone(selectedRunnerSession);
  }, [confirmRunDone, selectedRunnerSession]);

  const continueSelectedRun = useCallback(() => {
    if (selectedRunnerSession) continueRun(selectedRunnerSession);
  }, [continueRun, selectedRunnerSession]);

  const archiveSelectedRun = useCallback(() => {
    if (selectedRunnerSession) archiveRun(selectedRunnerSession);
  }, [archiveRun, selectedRunnerSession]);

  const markSelectedRunReview = useCallback(() => {
    if (selectedRunnerSession) markRunReview(selectedRunnerSession);
  }, [markRunReview, selectedRunnerSession]);

  const queueWorkstreamToRun = useCallback((session: AgentRunnerSession, workstream: AgentWorkstream) => {
    const nextQueue = addWorkstreamToRunQueue(session.queue, workstream);
    const activeItem = nextQueue.find((item) => item.status === 'active') ?? nextQueue[0] ?? null;
    patchAndRefreshRunnerSession(session.id, {
      queue: nextQueue,
      plan_steps: queueToPlanSteps(nextQueue),
      task_id: session.task_id ?? activeItem?.id ?? workstream.id,
      work_goal: session.work_goal ?? workstream.projectLabel,
      run_label: session.run_label && session.run_label !== 'leer'
        ? session.run_label
        : activeItem?.title ?? stripVisibleIds(workstream.title),
      next_decision: `${stripVisibleIds(workstream.title)} ist in der Run-Queue. Agent soll nach aktuellem Schritt damit weitermachen oder Leon um Freigabe bitten.`,
    });
    if (session.runtime !== 'shell') {
      void sendSessionInput(session.id, `${buildQueuedWorkstreamPrompt(workstream)}\r`);
    }
    setSelectedSessionId(session.id);
    setContextPanelOpen(true);
  }, [patchAndRefreshRunnerSession, sendSessionInput]);

  const queueWorkstreamToSelectedRun = useCallback((workstream: AgentWorkstream) => {
    if (!selectedRunnerSession) {
      selectWorkstream(workstream);
      setLaunchMode('task');
      setLauncherOpen(true);
      return;
    }
    queueWorkstreamToRun(selectedRunnerSession, workstream);
    setWorkstreamDrawerOpen(false);
  }, [queueWorkstreamToRun, selectWorkstream, selectedRunnerSession]);

  const queueWorkstreamToSession = useCallback((sessionId: string, workstreamId: string) => {
    const session = runnerSessions.find((item) => item.id === sessionId);
    const workstream = workstreams.find((item) => item.id === workstreamId);
    if (!session || !workstream) return;
    queueWorkstreamToRun(session, workstream);
    setWorkstreamDrawerOpen(false);
  }, [queueWorkstreamToRun, runnerSessions, workstreams]);

  async function startRun() {
    setLaunchError(null);
    const launchWorkstream = launchMode === 'task' ? selectedWorkstream : null;
    const launchProject = launchMode === 'project' ? selectedProject : null;
    if (!runnerOnline) {
      setLaunchError('Lokaler Runner ist offline. Starte erst den Team-OS Agent Runner.');
      return;
    }
    if (!capabilities[runtime]) {
      setLaunchError(`${labelForRuntime(runtime)} ist im Runner aktuell nicht verfügbar.`);
      return;
    }
    if (launchMode === 'task' && !launchWorkstream) {
      setLaunchError('Bitte zuerst einen Task auswählen.');
      return;
    }
    if (launchMode === 'project' && !launchProject) {
      setLaunchError('Bitte zuerst ein Projekt auswählen.');
      return;
    }

    const targetCwd = cwd || launchWorkstream?.repoPath || launchProject?.repoPath || AGENT_REPOS[0].path;
    const selectedRepo = repoForPath(targetCwd);
    const title = launchMode === 'quick'
      ? `${labelForRuntime(runtime)} quick terminal`
      : launchWorkstream
        ? `${launchWorkstream.projectLabel} · ${launchWorkstream.title}`
        : `${launchProject?.title ?? 'Projektsequenz'} · ${labelForRuntime(runtime)}`;
    const workGoal = launchMode === 'quick'
      ? 'Queue'
      : launchWorkstream?.projectLabel ?? launchProject?.title ?? selectedRepo?.label ?? 'Run';
    const runLabel = launchMode === 'quick'
      ? 'leer'
      : launchWorkstream?.title ?? 'Projektsequenz';
    const layout = nextTerminalLayout(runnerSessions.length);
    const projectSequence = launchWorkstream
      ? projectTaskGroups.find((group) => group.items.some((item) => item.id === launchWorkstream.id))?.items ?? [launchWorkstream]
      : launchProject
        ? projectTaskGroups.find((group) => group.id === launchProject.id || group.title === launchProject.title)?.items ?? []
        : [];
    const queue = launchMode === 'quick'
      ? []
      : launchWorkstream
        ? buildTaskRunQueue(launchWorkstream, projectSequence)
        : buildProjectRunQueue(projectSequence);

    setBusy(true);
    try {
      const response = await fetch(`${RUNNER_BASE}/sessions`, {
        method: 'POST',
        headers: runnerHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          runtime,
          cwd: targetCwd,
          user_id: memberId,
          linear_identifier: launchWorkstream?.identifier ?? null,
          workstream: launchWorkstream?.projectLabel ?? launchProject?.title ?? 'Agent Workstream',
          work_goal: stripVisibleIds(workGoal),
          run_label: stripVisibleIds(runLabel),
          title,
          branch: launchWorkstream?.branch ?? null,
          worktree_path: launchWorkstream?.worktreePath ?? targetCwd,
          last_decision: launchWorkstream?.lastDecision ?? null,
          next_decision: launchWorkstream?.nextDecision ?? (launchMode === 'quick'
            ? 'Task wählen, Kontext pinnen oder frei prompten.'
            : 'Status kurz erfassen und ersten Arbeitsblock starten.'),
          task_id: launchWorkstream?.id ?? (launchMode === 'project' ? launchProject?.id : null) ?? null,
          repo_key: launchWorkstream?.repoLabel ?? launchProject?.repoLabel ?? selectedRepo?.label ?? null,
          queue,
          plan_steps: queueToPlanSteps(queue),
          layout,
          preferred_command: null,
          initial_prompt: launchMode === 'quick'
            ? buildQuickTerminalPrompt(runtime)
            : launchWorkstream
            ? buildWorkstreamPrompt(launchWorkstream, runtime, queue)
            : buildProjectPrompt(launchProject, runtime, queue),
        }),
      });
      const payload = await response.json().catch(() => null) as { session?: AgentRunnerSession; error?: string } | null;
      if (!response.ok || !payload?.session) {
        throw new Error(payload?.error ?? 'Runner konnte die Session nicht starten.');
      }
      const created = payload.session;
      setRunnerSessions((previous) => [...previous.filter((item) => item.id !== created.id), created].filter(isRunnerSessionLive));
      setSelectedSessionId(created.id);
      setContextPanelOpen(true);
      setLauncherOpen(false);
      void refreshRunner({ silent: true });
    } catch (error) {
      setLaunchError(error instanceof Error ? error.message : 'Runner konnte die Session nicht starten.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="agent-cockpit agent-cockpit-map-mode">
      <section className="agent-map-topbar glass card-rise">
        <div className="agent-stat-rail" aria-label="Agent status">
          <MiniStat value={runnerOnline ? 'Live' : 'Off'} label="Runner" tone={runnerOnline ? 'ok' : 'warn'} />
          <MiniStat value={String(activeRunsCount)} label="Active Runs" />
          <MiniStat value={String(needsLeonCount)} label="Needs Leon" tone={needsLeonCount > 0 ? 'warn' : 'ok'} />
          <MiniStat value={String(urgentCount)} label="Heute / Risk" tone={urgentCount > 0 ? 'warn' : undefined} />
        </div>
        <div className="agent-top-actions">
          <span className={`agent-connection ${runnerOnline ? 'online' : 'offline'}`}>
            <span className={`agent-dot ${runnerOnline ? 'ok' : 'off'}`} />
            {runnerStatus}{lastRefresh ? ` · ${lastRefresh}` : ''}
          </span>
          {runnerOnline && activeRunnerProcessCount > 0 && (
            <span className="agent-session-safety" title={runnerSafety?.note ?? 'Frontend reloads reconnect. Runner restart closes active PTY processes.'}>
              UI reload sicher · Runner halten
            </span>
          )}
          <button type="button" className="agent-icon-button" onClick={() => void refreshRunner()} disabled={refreshing} title="Runner aktualisieren">
            <RefreshCw size={15} className={refreshing ? 'agent-spin' : undefined} aria-hidden />
          </button>
          <button type="button" className="agent-secondary-button" onClick={() => setWorkstreamDrawerOpen(true)}>
            <ListChecks size={14} aria-hidden />
            Fokus
          </button>
          <button type="button" className="agent-secondary-button" onClick={openArchiveDrawer}>
            <Archive size={14} aria-hidden />
            Archiv
          </button>
          <div className="agent-start-run-wrap">
            <button
              ref={startRunButtonRef}
              type="button"
              className="agent-primary agent-start-run"
              onClick={() => setStartMenuOpen((value) => !value)}
            >
              <Plus size={15} aria-hidden />
              Start Run
            </button>
            <AgentStartRunMenu
              open={startMenuOpen}
              anchorRef={startRunButtonRef}
              onClose={() => setStartMenuOpen(false)}
              onTaskStart={openTaskLauncher}
              onQuickTerminal={openQuickTerminalLauncher}
            />
          </div>
        </div>
      </section>

      <div className={`agent-map-layout ${contextPanelOpen && selectedRunnerSession ? 'has-context' : ''}`}>
        <section className="agent-map-stage glass card-rise">
          <AgentTerminalMap
            graph={graph}
            selectedSessionId={selectedSessionId}
            runnerBase={RUNNER_BASE}
            runnerOnline={runnerOnline}
            runnerStatus={runnerStatus}
            onSelectSession={selectSession}
            onLayoutChange={updateLayout}
            onClearSelection={() => {
              setContextPanelOpen(false);
              setSelectedSessionId('');
            }}
            onStartRun={openQuickTerminalLauncher}
            onRefreshRunner={() => void refreshRunner()}
            onQueueWorkstream={queueWorkstreamToSession}
            onContinueSession={(sessionId) => {
              const session = runnerSessions.find((item) => item.id === sessionId);
              if (session) continueRun(session);
            }}
            onReviewSession={(sessionId) => {
              const session = runnerSessions.find((item) => item.id === sessionId);
              if (session) markRunReview(session);
            }}
            onArchiveSession={(sessionId) => {
              const session = runnerSessions.find((item) => item.id === sessionId);
              if (session) archiveRun(session);
            }}
          />
        </section>

        {contextPanelOpen && selectedRunnerSession && (
          <AgentRunInspector
            session={selectedRunnerSession}
            workstream={selectedWorkstream}
            projectGroup={selectedProjectTaskGroup}
            onClose={() => {
              setContextPanelOpen(false);
              setSelectedSessionId('');
            }}
            onConfirmDone={confirmSelectedRunDone}
            onContinue={continueSelectedRun}
            onReview={markSelectedRunReview}
            onArchive={archiveSelectedRun}
          />
        )}
      </div>

      {workstreamDrawerOpen && (
        <WorkstreamDrawer
          projectGroups={projectTaskGroups}
          focusWorkstreams={focusWorkstreams}
          selectedId={selectedWorkstream?.id ?? ''}
          search={workstreamSearch}
          onSearch={setWorkstreamSearch}
          onClose={() => setWorkstreamDrawerOpen(false)}
          onSelect={selectWorkstream}
          onQueueToRun={queueWorkstreamToSelectedRun}
          onSessionSelect={selectSession}
          canQueueToRun={Boolean(selectedRunnerSession)}
        />
      )}

      {archiveDrawerOpen && (
        <ArchiveDrawer
          sessions={archivedSessions}
          runnerOnline={runnerOnline}
          onClose={() => setArchiveDrawerOpen(false)}
          onRefresh={() => void refreshArchive()}
        />
      )}

      {launcherOpen && (
        <StartRunModal
          mode={launchMode}
          setMode={setLaunchMode}
          projectGroups={projectTaskGroups}
          projects={projectWorkstreams.filter((project) => project.stage !== 'done')}
          selectedWorkstream={selectedWorkstream}
          selectedProject={selectedProject}
          selectedWorkstreamId={selectedWorkstream?.id ?? ''}
          selectedProjectId={selectedProjectId}
          search={workstreamSearch}
          setSearch={setWorkstreamSearch}
          onSelectWorkstream={selectWorkstream}
          onSelectProject={selectProject}
          runtime={runtime}
          setRuntime={setRuntime}
          cwd={cwd}
          setCwd={setCwd}
          capabilities={capabilities}
          busy={busy}
          error={launchError}
          onClose={() => setLauncherOpen(false)}
          onStart={() => void startRun()}
        />
      )}
    </div>
  );
}

function MiniStat({ value, label, tone }: { value: string; label: string; tone?: 'ok' | 'warn' }) {
  return (
    <div className={`agent-mini-stat ${tone ? `tone-${tone}` : ''}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function WorkstreamDrawer({
  projectGroups,
  focusWorkstreams,
  selectedId,
  search,
  onSearch,
  onClose,
  onSelect,
  onQueueToRun,
  onSessionSelect,
  canQueueToRun,
}: {
  projectGroups: ProjectTaskGroup[];
  focusWorkstreams: AgentWorkstream[];
  selectedId: string;
  search: string;
  onSearch: (value: string) => void;
  onClose: () => void;
  onSelect: (workstream: AgentWorkstream) => void;
  onQueueToRun: (workstream: AgentWorkstream) => void;
  onSessionSelect: (sessionId: string) => void;
  canQueueToRun: boolean;
}) {
  const count = projectGroups.reduce((sum, group) => sum + group.items.length, 0);
  return (
    <div className="agent-task-drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside className="agent-task-drawer glass card-rise" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="agent-workstream-head">
          <div>
            <p className="ovr">Projekte & Tasks</p>
            <h2>Fokus & Sequenz</h2>
            <small>{count} offene Schritte insgesamt</small>
          </div>
          <button type="button" className="agent-icon-button" onClick={onClose} title="Schließen">
            <X size={16} aria-hidden />
          </button>
        </div>
        <label className="agent-workstream-search">
          <Search size={14} aria-hidden />
          <input
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Projekt, Task, Repo suchen"
          />
        </label>
        {focusWorkstreams.length > 0 && (
          <section className="agent-drawer-focus">
            <div className="agent-drawer-section-title">
              <span>Fokus</span>
            </div>
            <div className="agent-workstream-list agent-focus-list">
              {focusWorkstreams.map((workstream, index) => (
                <WorkstreamRow
                  key={workstream.id}
                  index={index + 1}
                  workstream={workstream}
                  selected={workstream.id === selectedId}
                  onSelect={() => onSelect(workstream)}
                  onQueue={() => onQueueToRun(workstream)}
                  onSessionSelect={onSessionSelect}
                  canQueueToRun={canQueueToRun}
                />
              ))}
            </div>
          </section>
        )}
        <div className="agent-drawer-section-title agent-drawer-section-title--sequence">
          <span>Projektsequenzen</span>
          <small>nächste offene Schritte</small>
        </div>
        <div className="agent-project-sequence">
          {projectGroups.map((group) => (
            <details key={group.id} className="agent-project-sequence-group" open>
              <summary>
                <span>
                  <strong>{group.title}</strong>
                  <small>{group.repoLabel} · {group.urgencyLabel}</small>
                </span>
                <span className="agent-project-sequence-progress">{group.progress?.label ?? `${group.items.filter((item) => item.stage === 'done').length} / ${group.items.length}`}</span>
              </summary>
              <div className="agent-workstream-list">
                {group.items.map((workstream, index) => (
                  <WorkstreamRow
                    key={workstream.id}
                    index={index + 1}
                    workstream={workstream}
                    selected={workstream.id === selectedId}
                    onSelect={() => onSelect(workstream)}
                    onQueue={() => onQueueToRun(workstream)}
                    onSessionSelect={onSessionSelect}
                    canQueueToRun={canQueueToRun}
                  />
                ))}
              </div>
            </details>
          ))}
        </div>
      </aside>
    </div>
  );
}

function WorkstreamRow({
  index,
  workstream,
  selected,
  onSelect,
  onQueue,
  onSessionSelect,
  canQueueToRun,
}: {
  index: number;
  workstream: AgentWorkstream;
  selected: boolean;
  onSelect: () => void;
  onQueue: () => void;
  onSessionSelect: (sessionId: string) => void;
  canQueueToRun: boolean;
}) {
  return (
    <article
      className={`agent-workstream-row ${selected ? 'is-selected' : ''}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData('application/x-agent-workstream-id', workstream.id);
        event.dataTransfer.effectAllowed = 'copy';
      }}
    >
      <button type="button" className="agent-workstream-main" onClick={onSelect}>
        <span className="agent-workstream-title">
          <em>{index}</em>
          {stripVisibleIds(workstream.title)}
        </span>
        <span className="agent-workstream-meta">
          <TaskChip label={workstream.urgencyLabel} tone={workstream.urgency} />
          <TaskChip label={workstream.repoLabel} />
          <StageChip stage={workstream.stage} label={workstream.stageLabel} />
        </span>
        {workstream.progress && <ProgressMini progress={workstream.progress} />}
      </button>
      <div className="agent-workstream-actions">
        <button type="button" onClick={onQueue}>
          {canQueueToRun ? 'In Run legen' : 'Run starten'}
        </button>
      </div>
      {workstream.activeSessions.length > 0 && (
        <div className="agent-runtime-strip">
          {workstream.activeSessions.map((session) => (
            <button
              key={session.session_id}
              type="button"
              onClick={() => onSessionSelect(sessionIdOf(session))}
              title={session.title ?? session.workstream ?? session.runtime}
            >
              <RuntimeChip runtime={session.runtime} />
              <span>{session.status}</span>
            </button>
          ))}
        </div>
      )}
    </article>
  );
}

function ArchiveDrawer({
  sessions,
  runnerOnline,
  onClose,
  onRefresh,
}: {
  sessions: AgentRunnerSession[];
  runnerOnline: boolean;
  onClose: () => void;
  onRefresh: () => void;
}) {
  return (
    <div className="agent-task-drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside className="agent-task-drawer agent-archive-drawer glass card-rise" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="agent-workstream-head">
          <div>
            <p className="ovr">Session Archiv</p>
            <h2>{sessions.length} abgeschlossene Runs</h2>
          </div>
          <div className="agent-drawer-actions">
            <button type="button" className="agent-icon-button" onClick={onRefresh} title="Archiv aktualisieren">
              <RefreshCw size={15} aria-hidden />
            </button>
            <button type="button" className="agent-icon-button" onClick={onClose} title="Schließen">
              <X size={16} aria-hidden />
            </button>
          </div>
        </div>
        {!runnerOnline && <p className="agent-archive-note">Runner offline. Lokales Archiv wird sichtbar, sobald der Runner erreichbar ist.</p>}
        <div className="agent-archive-list">
          {sessions.map((session) => (
            <article key={session.id}>
              <RuntimeChip runtime={session.runtime} />
              <div>
                <strong>{session.title}</strong>
                <small>{session.workstream ?? compactPath(session.cwd)} · {session.status} · {formatDateTime(session.updated_at)}</small>
              </div>
            </article>
          ))}
          {!sessions.length && <p className="agent-archive-note">Keine archivierten Sessions geladen.</p>}
        </div>
      </aside>
    </div>
  );
}

function StartRunModal({
  mode,
  setMode,
  projectGroups,
  projects,
  selectedWorkstream,
  selectedProject,
  selectedWorkstreamId,
  selectedProjectId,
  search,
  setSearch,
  onSelectWorkstream,
  onSelectProject,
  runtime,
  setRuntime,
  cwd,
  setCwd,
  capabilities,
  busy,
  error,
  onClose,
  onStart,
}: {
  mode: LaunchMode;
  setMode: (mode: LaunchMode) => void;
  projectGroups: ProjectTaskGroup[];
  projects: AgentProjectWorkstream[];
  selectedWorkstream: AgentWorkstream | null;
  selectedProject: AgentProjectWorkstream | null;
  selectedWorkstreamId: string;
  selectedProjectId: string;
  search: string;
  setSearch: (value: string) => void;
  onSelectWorkstream: (workstream: AgentWorkstream) => void;
  onSelectProject: (project: AgentProjectWorkstream) => void;
  runtime: Runtime;
  setRuntime: (runtime: Runtime) => void;
  cwd: string;
  setCwd: (cwd: string) => void;
  capabilities: RunnerCapabilities;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onStart: () => void;
}) {
  const [repoOpen, setRepoOpen] = useState(false);
  const currentRepo = AGENT_REPOS.find((repo) => repo.path === cwd) ?? AGENT_REPOS[0];
  const focusTitle = mode === 'task'
    ? selectedWorkstream?.title ?? 'Kein Task ausgewählt'
    : mode === 'project'
      ? selectedProject?.title ?? 'Kein Projekt ausgewählt'
      : 'Freies Terminal';
  const focusMeta = mode === 'task'
    ? `${selectedWorkstream?.projectLabel ?? 'Team-OS'} · ${selectedWorkstream?.urgencyLabel ?? 'Normal'} · ${selectedWorkstream?.repoLabel ?? currentRepo.label}`
    : mode === 'project'
      ? `${selectedProject?.progress.label ?? '0 / 0'} Steps · ${selectedProject?.urgencyLabel ?? 'Normal'} · ${selectedProject?.repoLabel ?? currentRepo.label}`
      : `${currentRepo.label} · Queue · normal promptbar`;

  return (
    <div className="agent-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="agent-modal glass card-rise" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <header className="agent-modal-head">
          <div>
            <p className="ovr">Agent Run</p>
            <h2>{mode === 'quick' ? 'Quick Terminal starten' : 'Task oder Projekt starten'}</h2>
          </div>
          {mode !== 'quick' && (
            <div className="agent-mode-tabs" aria-label="Run-Typ">
              <button type="button" className={mode === 'task' ? 'is-active' : undefined} onClick={() => setMode('task')}>
                <SquareTerminal size={13} aria-hidden />
                Task
              </button>
              <button type="button" className={mode === 'project' ? 'is-active' : undefined} onClick={() => setMode('project')}>
                <ListChecks size={13} aria-hidden />
                Projekt
              </button>
            </div>
          )}
          <div className="agent-modal-head-actions">
            <button type="button" className="agent-icon-button" onClick={onClose} title="Schließen">
              <X size={16} aria-hidden />
            </button>
          </div>
        </header>

        <div className="agent-modal-grid">
          <div className="agent-picker-panel">
            {mode === 'quick' ? (
              <div className="agent-quick-start-card">
                <SquareTerminal size={18} aria-hidden />
                <strong>Leeres Terminal mit Queue-Kontext</strong>
                <p>Starte minimal, promte Claude/Codex selbst und pinne danach Tasks in diesen Run.</p>
              </div>
            ) : mode === 'task' ? (
              <>
                <label className="agent-search">
                  <Search size={14} aria-hidden />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Task, Repo, Projekt suchen" />
                </label>
                <div className="agent-task-groups">
                  {projectGroups.map((group) => (
                    <details key={group.id} className="agent-task-group" open>
                      <summary>
                        <span>{group.title}</span>
                        <small>{group.items.length}</small>
                      </summary>
                      <div className="agent-task-list">
                        {group.items.map((workstream) => (
                          <button
                            key={workstream.id}
                            type="button"
                            className={workstream.id === selectedWorkstreamId ? 'is-selected' : undefined}
                            onClick={() => onSelectWorkstream(workstream)}
                          >
                            <span className="agent-task-title">
                              {stripVisibleIds(workstream.title)}
                            </span>
                            <span className="agent-task-meta">
                              <TaskChip label={workstream.urgencyLabel} tone={workstream.urgency} />
                              <TaskChip label={workstream.projectLabel} />
                              <TaskChip label={workstream.repoLabel} />
                              <StageChip stage={workstream.stage} label={workstream.stageLabel} />
                            </span>
                          </button>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              </>
            ) : (
              <div className="agent-project-list">
                {projects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    className={project.id === selectedProjectId ? 'is-selected' : undefined}
                    onClick={() => onSelectProject(project)}
                  >
                    <span>
                      <strong>{project.title}</strong>
                      <small>{project.repoLabel} · {project.urgencyLabel}</small>
                    </span>
                    <ProgressMini progress={project.progress} />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="agent-launch-config">
            <section>
              <h3>Runtime</h3>
              <div className="agent-runtime-logo-grid">
                {RUNTIME_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={runtime === option.id ? 'is-selected' : undefined}
                    onClick={() => setRuntime(option.id)}
                    disabled={!capabilities[option.id]}
                    title={option.fit}
                  >
                    <strong>{option.glyph}</strong>
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h3>Repo / Worktree</h3>
              <div className="agent-repo-dropdown">
                <button type="button" className="agent-repo-current" onClick={() => setRepoOpen((open) => !open)}>
                  <GitBranch size={14} aria-hidden />
                  <span>
                    <strong>{currentRepo.label}</strong>
                    <small>{currentRepo.path}</small>
                  </span>
                  <ChevronDown size={14} className={repoOpen ? 'is-open' : undefined} aria-hidden />
                </button>
                {repoOpen && (
                  <div className="agent-repo-menu">
                    {AGENT_REPOS.map((repo) => (
                      <button
                        key={repo.path}
                        type="button"
                        className={repo.path === cwd ? 'is-selected' : undefined}
                        onClick={() => {
                          setCwd(repo.path);
                          setRepoOpen(false);
                        }}
                      >
                        <span>
                          <strong>{repo.label}</strong>
                          <small>{repo.path}</small>
                        </span>
                        {repo.path === cwd && <Check size={14} aria-hidden />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className="agent-selection-summary">
              <strong>{focusTitle}</strong>
              <small>{focusMeta}</small>
            </section>

            <section className="agent-runtime-hint">
              {RUNTIME_OPTIONS.find((option) => option.id === runtime)?.fit}
            </section>

            {error && <div className="agent-launch-error">{error}</div>}

            <button type="button" className="agent-primary agent-modal-start" onClick={onStart} disabled={busy}>
              <Play size={14} aria-hidden />
              {busy ? 'Starte ...' : 'Run starten'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function ProgressMini({ progress }: { progress: { done: number; total: number; pct: number; label: string } }) {
  return (
    <span className="agent-progress-mini" title={`${progress.done} von ${progress.total} Steps erledigt`}>
      <i style={{ width: `${progress.pct}%` }} />
      <small>{progress.label}</small>
    </span>
  );
}

function StageChip({ stage, label }: { stage: AgentStage; label: string }) {
  return <span className={`agent-stage-chip tone-${stage}`}>{label}</span>;
}

function RuntimeChip({ runtime }: { runtime: AgentRuntime }) {
  return <span className={`agent-runtime ${runtime}`}>{runtime}</span>;
}

function TaskChip({ label, tone }: { label: string; tone?: string }) {
  return <span className={`agent-task-chip ${tone ? `tone-${tone}` : ''}`}>{label}</span>;
}

function sessionIdOf(session: AgentActiveSessionSnapshot) {
  return session.terminal_session_id ?? session.session_id;
}

function runnerSessionMatchesWorkstream(session: AgentRunnerSession, workstream: AgentWorkstream) {
  if (session.task_id === workstream.id) return true;
  if (workstream.identifier && session.linear_identifier === workstream.identifier) return true;
  const haystack = `${session.title} ${session.workstream ?? ''}`.toLowerCase();
  return haystack.includes(workstream.title.toLowerCase()) || haystack.includes(workstream.projectLabel.toLowerCase());
}

function labelForRuntime(runtime: Runtime) {
  return RUNTIME_OPTIONS.find((option) => option.id === runtime)?.label ?? runtime;
}

function buildWorkstreamPrompt(workstream: AgentWorkstream, runtime: Runtime, queue = buildTaskRunQueue(workstream)) {
  return [
    `Du bist ${labelForRuntime(runtime)} in Team-OS Agent Cockpit.`,
    `Task: ${workstream.identifier ? `${workstream.identifier} - ` : ''}${workstream.title}`,
    `Projekt: ${workstream.projectLabel}`,
    `Repo/Worktree: ${workstream.worktreePath ?? workstream.repoPath}`,
    `Stage: ${workstream.stageLabel}`,
    queue.length > 1 ? `Queue danach:\n${queue.slice(1, 5).map((item, index) => `${index + 1}. ${item.title}`).join('\n')}` : null,
    workstream.nextDecision ? `Naechste Entscheidung: ${workstream.nextDecision}` : null,
    'Arbeite nur in dieser Lane. Starte mit einem knappen Status, dann fuehre den naechsten sicheren Schritt aus.',
  ].filter(Boolean).join('\n');
}

function buildProjectPrompt(project: AgentProjectWorkstream | null, runtime: Runtime, queue = buildProjectRunQueue()) {
  return [
    `Du bist ${labelForRuntime(runtime)} in Team-OS Agent Cockpit.`,
    `Projekt: ${project?.title ?? 'Agent Project'}`,
    `Repo/Worktree: ${project?.repoPath ?? AGENT_REPOS[0].path}`,
    `Fortschritt: ${project?.progress.label ?? '0 / 0'}`,
    queue.length ? `Task-Queue:\n${queue.slice(0, 6).map((item, index) => `${index + 1}. ${item.title}`).join('\n')}` : null,
    'Koordiniere die naechsten Projektschritte, aber veraendere nur klar zugeordnete Dateien.',
  ].filter(Boolean).join('\n');
}

function buildQuickTerminalPrompt(runtime: Runtime) {
  return [
    `Du bist ${labelForRuntime(runtime)} in einem Team-OS Quick Terminal.`,
    'Starte mit einem knappen Status: welches Repo, welche Absicht, welcher naechste sichere Schritt.',
    'Wenn Leon dir eine Task nennt, pinne sie gedanklich an diesen Run und halte Fortschritt, Blocker und Done-Status sichtbar.',
  ].join('\n');
}

function buildQueuedWorkstreamPrompt(workstream: AgentWorkstream) {
  return [
    'Neue Team-OS Queue-Task wurde angehaengt.',
    `Task: ${workstream.identifier ? `${workstream.identifier} - ` : ''}${workstream.title}`,
    `Projekt: ${workstream.projectLabel}`,
    `Repo/Worktree: ${workstream.worktreePath ?? workstream.repoPath}`,
    'Bitte nach dem aktuellen Schritt uebernehmen oder kurz sagen, wenn Leon entscheiden muss.',
  ].join('\n');
}

function buildContinueQueuedWorkstreamPrompt(workstream: AgentWorkstream) {
  return [
    'Leon hat Weiter mit Queue bestaetigt.',
    `Starte jetzt diese Task: ${workstream.identifier ? `${workstream.identifier} - ` : ''}${workstream.title}`,
    `Projekt: ${workstream.projectLabel}`,
    `Repo/Worktree: ${workstream.worktreePath ?? workstream.repoPath}`,
    'Gib zuerst einen 1-Satz-Status, dann arbeite den naechsten sicheren Schritt ab.',
  ].join('\n');
}

function compactPath(path?: string | null) {
  if (!path) return 'Noch nicht gesetzt';
  return path.replace(/^C:\\Kalkulai\\/i, '');
}

function repoForPath(path: string) {
  const normalized = path.toLowerCase().replace(/\//g, '\\');
  return AGENT_REPOS.find((repo) => {
    const repoPath = repo.path.toLowerCase().replace(/\//g, '\\');
    return normalized === repoPath || normalized.startsWith(`${repoPath}\\`);
  }) ?? null;
}

function runnerHeaders(base?: HeadersInit): HeadersInit {
  if (!RUNNER_TOKEN) return base ?? {};
  return { ...(base as Record<string, string> | undefined), 'x-agent-runner-token': RUNNER_TOKEN };
}

function nextTerminalLayout(index: number): AgentSessionLayout {
  return {
    x: 64 + (index % 2) * 660,
    y: 188 + Math.floor(index / 2) * 470,
    width: 620,
    height: 440,
  };
}

function formatDateTime(value?: string) {
  if (!value) return 'ohne Datum';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'ohne Datum';
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function buildProjectTaskGroups(
  workstreams: AgentWorkstream[],
  projects: AgentProjectWorkstream[],
): ProjectTaskGroup[] {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const groups = new Map<string, ProjectTaskGroup>();

  for (const workstream of workstreams) {
    const key = workstream.projectId ?? workstream.projectLabel ?? 'inbox';
    const project = workstream.projectId ? projectById.get(workstream.projectId) : null;
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(workstream);
      continue;
    }
    groups.set(key, {
      id: key,
      title: project?.title ?? workstream.projectLabel ?? 'Ohne Projekt',
      repoLabel: project?.repoLabel ?? workstream.repoLabel,
      urgencyLabel: project?.urgencyLabel ?? workstream.urgencyLabel,
      progress: project?.progress ?? workstream.progress,
      items: [workstream],
    });
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      items: [...group.items].sort(compareWorkstreamSequence),
    }))
    .sort((a, b) => projectRank(a) - projectRank(b) || a.title.localeCompare(b.title));
}

function buildFocusWorkstreams(workstreams: AgentWorkstream[]) {
  const candidates = workstreams
    .filter((workstream) => workstream.stage !== 'done')
    .filter((workstream) => (
      workstream.activeSessions.length > 0 ||
      workstream.stage === 'running' ||
      workstream.stage === 'needs-leon' ||
      workstream.stage === 'review' ||
      workstream.urgency === 'overdue' ||
      workstream.urgency === 'today' ||
      workstream.urgency === 'urgent' ||
      workstream.urgency === 'high'
    ))
    .sort(compareFocusWorkstream);

  if (candidates.length > 0) return candidates.slice(0, 2);

  return [...workstreams]
    .filter((workstream) => workstream.stage !== 'done')
    .sort(compareFocusWorkstream)
    .slice(0, 2);
}

function compareFocusWorkstream(a: AgentWorkstream, b: AgentWorkstream) {
  return activeSessionRank(b) - activeSessionRank(a) ||
    stageRank(a.stage) - stageRank(b.stage) ||
    urgencySortRank(a.urgency) - urgencySortRank(b.urgency) ||
    dateSortRank(a.dueDate) - dateSortRank(b.dueDate) ||
    prioritySortRank(a.priority) - prioritySortRank(b.priority) ||
    a.title.localeCompare(b.title);
}

function activeSessionRank(workstream: AgentWorkstream) {
  return workstream.activeSessions.length > 0 ? 1 : 0;
}

function compareWorkstreamSequence(a: AgentWorkstream, b: AgentWorkstream) {
  return stageRank(a.stage) - stageRank(b.stage) ||
    dateSortRank(a.dueDate) - dateSortRank(b.dueDate) ||
    urgencySortRank(a.urgency) - urgencySortRank(b.urgency) ||
    prioritySortRank(a.priority) - prioritySortRank(b.priority) ||
    a.title.localeCompare(b.title);
}

function projectRank(group: ProjectTaskGroup) {
  if (group.items.some((item) => item.stage === 'running')) return 0;
  if (group.items.some((item) => item.stage === 'needs-leon')) return 1;
  if (group.items.some((item) => item.urgency === 'overdue' || item.urgency === 'today')) return 2;
  return 3;
}

function stageRank(stage: AgentStage) {
  return {
    running: 0,
    'needs-leon': 1,
    review: 2,
    queued: 3,
    failed: 4,
    done: 5,
  }[stage];
}

function urgencySortRank(urgency: AgentWorkstream['urgency']) {
  return {
    overdue: 0,
    today: 1,
    urgent: 2,
    high: 3,
    soon: 4,
    normal: 5,
  }[urgency];
}

function dateSortRank(date: string | null) {
  return date ? Date.parse(date) || Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
}

function prioritySortRank(priority: number) {
  return priority > 0 ? priority : 99;
}
