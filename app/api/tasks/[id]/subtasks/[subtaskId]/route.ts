import { NextRequest, NextResponse } from 'next/server';
import { requireActor } from '@/lib/auth-context';
import { updateSubtask, deleteSubtask } from '@/lib/task-subtasks';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; subtaskId: string }> },
) {
  const actor = await requireActor(req, { allowMember: true, scopes: ['tasks:write'] });
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { subtaskId } = await params;
  if (!subtaskId) return NextResponse.json({ error: 'subtaskId required' }, { status: 400 });
  const body = await req.json().catch(() => null);
  const patch: { title?: string; completed?: boolean } = {};
  if (typeof body?.title === 'string') {
    const t = body.title.trim();
    if (!t) return NextResponse.json({ error: 'title cannot be empty' }, { status: 400 });
    patch.title = t;
  }
  if (typeof body?.completed === 'boolean') patch.completed = body.completed;
  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 });
  }
  try {
    await updateSubtask(subtaskId, patch);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; subtaskId: string }> },
) {
  const actor = await requireActor(req, { allowMember: true, scopes: ['tasks:write'] });
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { subtaskId } = await params;
  if (!subtaskId) return NextResponse.json({ error: 'subtaskId required' }, { status: 400 });
  try {
    await deleteSubtask(subtaskId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
