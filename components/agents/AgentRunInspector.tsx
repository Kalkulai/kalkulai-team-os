'use client';

import { GitBranch, Monitor, X } from 'lucide-react';
import type { AgentRunnerSession } from '@/types';
import type { AgentWorkstream } from '@/lib/agent-workstreams';
import { stripVisibleIds } from '@/lib/agent-workspace-graph';
import { queueToPlanSteps } from '@/lib/agent-run-queue';

export function AgentRunInspector({
  session,
  workstream,
  projectGroup,
  onClose,
  onConfirmDone,
  onContinue,
  onReview,
  onArchive,
}: {
  session: AgentRunnerSession;
  workstream: AgentWorkstream | null;
  projectGroup: { items: AgentWorkstream[] } | null;
  onClose: () => void;
  onConfirmDone: () => void;
  onContinue: () => void;
  onReview: () => void;
  onArchive: () => void;
}) {
  const queue = session.queue ?? [];
  const steps = session.plan_steps?.length
    ? session.plan_steps
    : queue.length
      ? queueToPlanSteps(queue)
      : fallbackSteps(workstream);
  const nextQueued = queue.find((item) => item.status === 'queued') ?? null;
  const currentIndex = projectGroup?.items.findIndex((item) => item.id === workstream?.id) ?? -1;
  const followUp = currentIndex >= 0
    ? projectGroup?.items.slice(currentIndex + 1).find((item) => item.stage !== 'done') ?? null
    : null;
  const changes = session.change_summary;
  const subagents = session.subagents ?? [];

  return (
    <aside className="agent-run-inspector glass card-rise">
      <div className="agent-run-inspector-head">
        <div>
          <h2>{displayGoal(session, workstream)}</h2>
          <p>{displayRunLabel(session, workstream)}</p>
        </div>
        <button type="button" className="agent-icon-button" onClick={onClose} title="Inspector schließen">
          <X size={15} aria-hidden />
        </button>
      </div>

      <section className="agent-run-section">
        <span>Fortschritt</span>
        <div className="agent-run-steps">
          {steps.map((step) => (
            <div key={step.id} className={`agent-run-step ${step.status}`}>
              <i />
              <p>{step.title}</p>
            </div>
          ))}
        </div>
      </section>

      {followUp && (
        <section className="agent-run-section">
          <span>Danach</span>
          <p className="agent-run-followup">{stripVisibleIds(followUp.title)}</p>
        </section>
      )}

      {nextQueued && !followUp && (
        <section className="agent-run-section">
          <span>Danach</span>
          <p className="agent-run-followup">{nextQueued.title}</p>
        </section>
      )}

      {changes && (
        <section className="agent-run-section">
          <span>Änderungen</span>
          <div className="agent-run-changes">
            <strong className="plus">+{changes.additions ?? 0}</strong>
            <strong className="minus">-{changes.deletions ?? 0}</strong>
            <small>{changes.files ?? 0} Dateien</small>
          </div>
        </section>
      )}

      <section className="agent-run-section">
        <span>Umgebung</span>
        <div className="agent-run-env">
          <p><Monitor size={14} aria-hidden />{workstream?.repoLabel ?? session.repo_key ?? compactPath(session.cwd)}</p>
          <p><GitBranch size={14} aria-hidden />{session.branch ?? 'Branch nicht gesetzt'}</p>
          <p>{compactPath(session.worktree_path ?? session.cwd)}</p>
        </div>
      </section>

      {subagents.length > 0 && (
        <section className="agent-run-section">
          <span>Subagents</span>
          <div className="agent-run-subagents">
            {subagents.map((subagent) => (
              <p key={subagent.id}>
                <i className={subagent.status} />
                <strong>{subagent.name}</strong>
                <small>{subagent.status}</small>
              </p>
            ))}
          </div>
        </section>
      )}

      {session.done_pending && (
        <section className="agent-run-done-card">
          <strong>Task fertig?</strong>
          <p>{nextQueued ? `Naechste Queue-Task: ${nextQueued.title}` : 'Entscheide, ob der Run weiterarbeitet oder geschlossen wird.'}</p>
          <div>
            <button type="button" onClick={onConfirmDone}>Done bestätigen</button>
            <button type="button" onClick={onContinue}>{nextQueued ? 'Weiter mit Queue' : 'Weiterarbeiten'}</button>
            <button type="button" onClick={onReview}>Review</button>
            <button type="button" onClick={onArchive}>Session schließen</button>
          </div>
        </section>
      )}
    </aside>
  );
}

function fallbackSteps(workstream: AgentWorkstream | null) {
  if (!workstream) return [];
  return [{ id: workstream.id, title: stripVisibleIds(workstream.title), status: 'active' as const }];
}

function displayGoal(session: AgentRunnerSession, workstream: AgentWorkstream | null) {
  return stripVisibleIds(session.work_goal ?? workstream?.projectLabel ?? session.workstream ?? 'Run') || 'Run';
}

function displayRunLabel(session: AgentRunnerSession, workstream: AgentWorkstream | null) {
  return stripVisibleIds(session.run_label ?? workstream?.title ?? session.title ?? 'leer') || 'leer';
}

function compactPath(value?: string | null) {
  if (!value) return 'Kein Worktree';
  return value.replace(/^C:\\Kalkulai\\/i, '');
}
