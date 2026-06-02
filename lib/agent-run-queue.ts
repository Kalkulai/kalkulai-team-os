import type { AgentRunPlanStep, AgentRunQueueItem } from '@/types';
import type { AgentWorkstream } from '@/lib/agent-workstreams';
import { stripVisibleIds } from '@/lib/agent-workspace-graph';

export function buildTaskRunQueue(
  workstream: AgentWorkstream,
  projectSequence: AgentWorkstream[] = [],
): AgentRunQueueItem[] {
  return normalizeQueue([
    queueItemFromWorkstream(workstream, 'active'),
    ...projectSequence
      .filter((item) => item.id !== workstream.id && item.stage !== 'done')
      .map((item) => queueItemFromWorkstream(item, 'queued')),
  ]);
}

export function buildProjectRunQueue(projectSequence: AgentWorkstream[] = []): AgentRunQueueItem[] {
  return normalizeQueue(
    projectSequence
      .filter((item) => item.stage !== 'done')
      .map((item, index) => queueItemFromWorkstream(item, index === 0 ? 'active' : 'queued')),
  );
}

export function addWorkstreamToRunQueue(
  queue: AgentRunQueueItem[] | null | undefined,
  workstream: AgentWorkstream,
): AgentRunQueueItem[] {
  const current = normalizeQueue(queue ?? []);
  if (current.some((item) => item.id === workstream.id)) return current;
  const hasActive = current.some((item) => item.status === 'active');
  return normalizeQueue([
    ...current,
    queueItemFromWorkstream(workstream, hasActive ? 'queued' : 'active'),
  ]);
}

export function advanceRunQueueAfterDone(queue: AgentRunQueueItem[] | null | undefined): AgentRunQueueItem[] {
  const current = normalizeQueue(queue ?? []);
  let closedActive = false;
  let promotedNext = false;

  return current.map((item) => {
    if (item.status === 'active' && !closedActive) {
      closedActive = true;
      return { ...item, status: 'done' };
    }
    if (closedActive && !promotedNext && item.status === 'queued') {
      promotedNext = true;
      return { ...item, status: 'active' };
    }
    return item;
  });
}

export function queueToPlanSteps(queue: AgentRunQueueItem[] | null | undefined): AgentRunPlanStep[] {
  return normalizeQueue(queue ?? []).map((item) => ({
    id: item.id,
    title: item.title,
    status: item.status === 'done' ? 'done' : item.status === 'blocked' ? 'blocked' : item.status === 'active' ? 'active' : 'todo',
  }));
}

export function queueItemFromWorkstream(
  workstream: AgentWorkstream,
  status: AgentRunQueueItem['status'] = 'queued',
): AgentRunQueueItem {
  return {
    id: workstream.id,
    title: stripVisibleIds(workstream.title) || workstream.title,
    repo_key: workstream.repoLabel,
    kind: inferQueueKind(workstream),
    status,
  };
}

function normalizeQueue(queue: AgentRunQueueItem[]): AgentRunQueueItem[] {
  const seen = new Set<string>();
  let activeSeen = false;
  const out: AgentRunQueueItem[] = [];

  for (const item of queue) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    const status = item.status === 'done' || item.status === 'blocked' || item.status === 'review'
      ? item.status
      : item.status === 'active' && !activeSeen
        ? 'active'
        : 'queued';
    if (status === 'active') activeSeen = true;
    out.push({
      ...item,
      title: stripVisibleIds(item.title) || item.title,
      status,
    });
  }

  return out;
}

function inferQueueKind(workstream: AgentWorkstream): AgentRunQueueItem['kind'] {
  const text = `${workstream.title} ${workstream.projectLabel} ${workstream.repoLabel}`.toLowerCase();
  if (/sales|partner|partnership|pipeline|reel/.test(text)) return 'sales';
  if (/research|obsidian|brain|notes|knowledge/.test(text)) return 'research';
  if (/operations|process|crm|hubspot|attio/.test(text)) return 'ops';
  if (/code|frontend|backend|bug|fix|test|ui|api|repo|branch|deploy|terminal|cockpit/.test(text)) return 'code';
  return 'general';
}
