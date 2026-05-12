import { NextRequest, NextResponse } from 'next/server';
import { upsertKpiTargets, getWeekTargets, currentWeekStart } from '@/lib/supabase';
import { requireApiAuth } from '@/lib/api-auth';

export async function GET(req: NextRequest) {
  if (!requireApiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });
  const weekStart = searchParams.get('weekStart') ?? currentWeekStart();
  const targets = await getWeekTargets(userId, weekStart);
  return NextResponse.json(targets);
}

export async function POST(req: NextRequest) {
  if (!requireApiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  const { userId, tasks_target, calls_target, bugs_target, weekStart } = body as {
    userId: string; tasks_target: number; calls_target: number; bugs_target: number; weekStart?: string;
  };
  if (!userId || typeof tasks_target !== 'number' || typeof calls_target !== 'number' || typeof bugs_target !== 'number') {
    return NextResponse.json({ error: 'userId, tasks_target, calls_target, bugs_target required' }, { status: 400 });
  }
  await upsertKpiTargets(userId, weekStart ?? currentWeekStart(), {
    tasks_target, calls_target, bugs_target,
  });
  return NextResponse.json({ ok: true });
}
