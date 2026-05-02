import { NextRequest, NextResponse } from 'next/server';
import { upsertKpiTargets, currentWeekStart } from '@/lib/supabase';
import { requireApiAuth } from '@/lib/api-auth';

export async function POST(req: NextRequest) {
  if (!requireApiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { userId, tasks_target, calls_target, bugs_target, weekStart } =
    (await req.json()) as {
      userId: string;
      tasks_target: number;
      calls_target: number;
      bugs_target: number;
      weekStart?: string;
    };
  await upsertKpiTargets(userId, weekStart ?? currentWeekStart(), {
    tasks_target, calls_target, bugs_target,
  });
  return NextResponse.json({ ok: true });
}
