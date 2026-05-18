import { NextRequest, NextResponse } from 'next/server';
import { updateIssue } from '@/lib/linear';
import { requireApiAuth } from '@/lib/api-auth';
import { revalidateDashboard } from '@/lib/revalidate';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!requireApiAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'body required' }, { status: 400 });

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

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 });
  }

  try {
    await updateIssue(id, patch);
    revalidateDashboard();
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
