import { NextRequest, NextResponse } from 'next/server';
import { requireActor } from '@/lib/auth-context';
import { updateIssue, setIssueStatus, archiveIssue } from '@/lib/linear';
import { supabaseAdmin } from '@/lib/supabase';
import { getTaskMetaByIssueIds, upsertTaskMeta, deleteTaskMeta } from '@/lib/task-meta-db';
import { revalidateDashboard } from '@/lib/revalidate';
import type { TaskBereich } from '@/lib/task-meta';

const VALID_BEREICHE = ['dashboard','angebot','planung','kommunikation','ma_mobil','allgemein'];

const STATUS_TO_STATE: Record<string, string | undefined> = {
  'in_progress':  process.env.LINEAR_IN_PROGRESS_STATE_ID,
  'in-progress':  process.env.LINEAR_IN_PROGRESS_STATE_ID,
  'todo':         process.env.LINEAR_TODO_STATE_ID,
  'on_hold':      process.env.LINEAR_ON_HOLD_STATE_ID ?? process.env.LINEAR_IN_PROGRESS_STATE_ID,
  'on-hold':      process.env.LINEAR_ON_HOLD_STATE_ID ?? process.env.LINEAR_IN_PROGRESS_STATE_ID,
  'done':         process.env.LINEAR_DONE_STATE_ID,
};

/**
 * PATCH /api/plan/tasks/:id
 *
 * Update a plan task. Accepts: phase, bereich, title, status, priority, dueDate, userId.
 * Only updates fields that are provided.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await requireActor(req, { allowMember: true, scopes: ['tasks:write'] });
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: issueId } = await params;
  const body = await req.json().catch(() => ({}));
  const { phase, bereich, title, status, priority, dueDate, userId } = body as {
    phase?: number;
    bereich?: string;
    title?: string;
    status?: string;
    priority?: number;
    dueDate?: string | null;
    userId?: string;
  };

  if (phase !== undefined && (typeof phase !== 'number' || phase < 1 || phase > 9)) {
    return NextResponse.json({ error: 'phase must be 1–9' }, { status: 400 });
  }
  if (bereich !== undefined && !VALID_BEREICHE.includes(bereich)) {
    return NextResponse.json({ error: `bereich must be one of ${VALID_BEREICHE.join(', ')}` }, { status: 400 });
  }

  // Determine userId for meta upsert
  let ownerId = userId;
  if (!ownerId && actor.type === 'member') ownerId = actor.memberId;

  // Update Linear issue fields (title, priority, dueDate)
  const linearUpdate: Record<string, unknown> = {};
  if (title !== undefined) linearUpdate.title = title.trim();
  if (priority !== undefined) linearUpdate.priority = priority;
  if (dueDate !== undefined) linearUpdate.dueDate = dueDate;

  if (Object.keys(linearUpdate).length > 0) {
    await updateIssue(issueId, linearUpdate);
  }

  // Update Linear state if status provided
  if (status) {
    const stateId = STATUS_TO_STATE[status];
    if (!stateId) return NextResponse.json({ error: `unknown status: ${status}` }, { status: 400 });
    await setIssueStatus(issueId, stateId);
  }

  // Update task_meta for phase/bereich
  if ((phase !== undefined || bereich !== undefined) && ownerId) {
    const existing = await getTaskMetaByIssueIds([issueId]);
    const cur = existing[issueId];
    await upsertTaskMeta(issueId, ownerId, {
      context: cur?.context ?? null,
      effortMinutes: cur?.effortMinutes ?? null,
      important: cur?.important ?? false,
      urgent: cur?.urgent ?? false,
      energy: cur?.energy ?? null,
      projectId: cur?.projectId ?? null,
      fixed: cur?.fixed ?? false,
      phase: phase ?? cur?.phase ?? null,
      bereich: (bereich ?? cur?.bereich ?? null) as TaskBereich | null,
    });
  }

  revalidateDashboard();
  return NextResponse.json({ ok: true, id: issueId });
}

/**
 * DELETE /api/plan/tasks/:id
 *
 * Removes phase/bereich from task_meta (demotes from plan) but keeps the Linear issue.
 * Pass ?archive=true to also archive the Linear issue.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await requireActor(req, { allowMember: true, scopes: ['tasks:write'] });
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: issueId } = await params;
  const archive = req.nextUrl.searchParams.get('archive') === 'true';

  await deleteTaskMeta(issueId);
  if (archive) await archiveIssue(issueId);

  revalidateDashboard();
  return NextResponse.json({ ok: true });
}
