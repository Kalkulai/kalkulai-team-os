import { NextRequest, NextResponse } from 'next/server';
import { requireActor } from '@/lib/auth-context';
import { parseDayBlocks } from '@/lib/day-plan';
import { getDayPlan, upsertDayPlan } from '@/lib/day-plan-db';
import { revalidateDashboard } from '@/lib/revalidate';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Read a user's timeboxed day plan. */
export async function GET(req: NextRequest) {
  const actor = await requireActor(req, { allowMember: true });
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });
  if (actor.type === 'member' && actor.memberId !== userId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const date = req.nextUrl.searchParams.get('date') || today();
  try {
    const plan = await getDayPlan(userId, date);
    return NextResponse.json(plan ?? { date, blocks: [], generatedBy: null, updatedAt: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/** Kai (or the user) writes the timeboxed day plan. */
export async function POST(req: NextRequest) {
  const actor = await requireActor(req, { allowMember: true, scopes: ['tasks:write'] });
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'body required' }, { status: 400 });

  const ownerId =
    actor.type === 'member'
      ? actor.memberId ?? null
      : typeof body.userId === 'string'
        ? body.userId
        : null;
  if (!ownerId) return NextResponse.json({ error: 'no owner' }, { status: 403 });

  const date = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : today();
  const blocks = parseDayBlocks(body.blocks);
  const generatedBy = typeof body.generatedBy === 'string' ? body.generatedBy : actor.id;

  try {
    await upsertDayPlan(ownerId, date, blocks, generatedBy);
    revalidateDashboard();
    return NextResponse.json({ ok: true, count: blocks.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
