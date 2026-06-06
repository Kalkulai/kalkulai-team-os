import { NextRequest, NextResponse } from 'next/server';
import { requireActor } from '@/lib/auth-context';
import { memberCanMutateIssue } from '@/lib/task-auth';
import { parseAssistInput } from '@/lib/task-assist';
import { upsertTaskAssist } from '@/lib/task-assist-db';
import { revalidateDashboard } from '@/lib/revalidate';

/** Kai (or Felix) writes the per-task suggestion: next step + follow-up tasks. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await requireActor(req, { allowMember: true, scopes: ['tasks:write'] });
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  if (!(await memberCanMutateIssue(actor, id))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'body required' }, { status: 400 });

  const ownerId =
    actor.type === 'member'
      ? actor.memberId ?? null
      : typeof body.userId === 'string'
        ? body.userId
        : null;
  if (!ownerId) return NextResponse.json({ error: 'no owner' }, { status: 403 });

  const { nextStep, followups } = parseAssistInput(body);
  try {
    await upsertTaskAssist(id, ownerId, nextStep, followups);
    revalidateDashboard();
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
