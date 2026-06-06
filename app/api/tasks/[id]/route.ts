import { NextRequest, NextResponse } from 'next/server';
import { updateIssue } from '@/lib/linear';
import { requireActor } from '@/lib/auth-context';
import { revalidateDashboard } from '@/lib/revalidate';
import { parseTaskMeta, quadrantToPriority } from '@/lib/task-meta';
import { upsertTaskMeta, getTaskMetaOwner } from '@/lib/task-meta-db';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await requireActor(req, { allowMember: true, scopes: ['tasks:write'] });
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'body required' }, { status: 400 });

  const meta = 'meta' in body ? parseTaskMeta(body.meta) : null;

  const patch: { title?: string; priority?: number | null; dueDate?: string | null } = {};

  if (typeof body.title === 'string') {
    const trimmed = body.title.trim();
    if (!trimmed) return NextResponse.json({ error: 'title cannot be empty' }, { status: 400 });
    patch.title = trimmed;
  }

  if ('priority' in body) {
    if (body.priority === null) {
      patch.priority = 0;
    } else if (typeof body.priority === 'number' && body.priority >= 0 && body.priority <= 4) {
      patch.priority = body.priority;
    } else {
      return NextResponse.json({ error: 'priority must be 0..4 or null' }, { status: 400 });
    }
  }

  if ('dueDate' in body) {
    if (body.dueDate === null || body.dueDate === '') {
      patch.dueDate = null;
    } else if (typeof body.dueDate === 'string') {
      patch.dueDate = body.dueDate;
    } else {
      return NextResponse.json({ error: 'dueDate must be string|null' }, { status: 400 });
    }
  }

  // Eisenhower drives Linear priority so the existing briefing/sort keeps working.
  if (meta) patch.priority = quadrantToPriority(meta.important, meta.urgent);

  if (Object.keys(patch).length === 0 && !meta) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 });
  }

  try {
    if (Object.keys(patch).length > 0) await updateIssue(id, patch);
    if (meta) {
      // Owner is the authenticated member; bearer (service) callers may name a user.
      const ownerId =
        actor.type === 'member'
          ? actor.memberId ?? null
          : typeof body.userId === 'string'
            ? body.userId
            : null;
      if (!ownerId) {
        return NextResponse.json({ error: 'no owner for meta' }, { status: 403 });
      }
      // Don't let one user overwrite another user's task_meta ownership.
      const existingOwner = await getTaskMetaOwner(id);
      if (existingOwner && existingOwner !== ownerId) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
      }
      await upsertTaskMeta(id, ownerId, meta);
    }
    revalidateDashboard();
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
