import { NextRequest, NextResponse } from 'next/server';
import { setIssueStatus } from '@/lib/linear';
import { requireApiAuth } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { format } from 'date-fns';

export async function POST(req: NextRequest) {
  if (!requireApiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.issueId || typeof body.issueId !== 'string') {
    return NextResponse.json({ error: 'issueId required' }, { status: 400 });
  }

  const stateId = process.env.LINEAR_DONE_STATE_ID;
  if (!stateId) return NextResponse.json({ error: 'LINEAR_DONE_STATE_ID not configured' }, { status: 500 });

  await setIssueStatus(body.issueId, stateId);

  if (body.userId && typeof body.userId === 'string') {
    const today = format(new Date(), 'yyyy-MM-dd');
    const { data: existing } = await supabaseAdmin
      .from('kpi_daily')
      .select('tasks_completed, calls_made, bugs_fixed, commits_count')
      .eq('user_id', body.userId)
      .eq('date', today)
      .single();

    await supabaseAdmin.from('kpi_daily').upsert(
      {
        user_id: body.userId,
        date: today,
        tasks_completed: (existing?.tasks_completed ?? 0) + 1,
        calls_made: existing?.calls_made ?? 0,
        bugs_fixed: existing?.bugs_fixed ?? 0,
        commits_count: existing?.commits_count ?? 0,
      },
      { onConflict: 'user_id,date' }
    );
  }

  return NextResponse.json({ ok: true });
}
