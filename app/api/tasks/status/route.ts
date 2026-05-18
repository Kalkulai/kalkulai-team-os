import { NextRequest, NextResponse } from 'next/server';
import { setIssueStatus } from '@/lib/linear';
import { requireApiAuth } from '@/lib/api-auth';
import { revalidateDashboard } from '@/lib/revalidate';

const STATE_MAP: Record<string, string | undefined> = {
  'todo': process.env.LINEAR_TODO_STATE_ID,
  'in-progress': process.env.LINEAR_IN_PROGRESS_STATE_ID,
  'on-hold': process.env.LINEAR_ON_HOLD_STATE_ID ?? process.env.LINEAR_IN_PROGRESS_STATE_ID,
  'done': process.env.LINEAR_DONE_STATE_ID,
};

export async function PATCH(req: NextRequest) {
  if (!requireApiAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null) as { issueId?: string; status?: string } | null;
  if (!body?.issueId || !body?.status) {
    return NextResponse.json({ error: 'issueId and status required' }, { status: 400 });
  }

  const stateId = STATE_MAP[body.status];
  if (!stateId) {
    return NextResponse.json({ error: `Unknown status: ${body.status}` }, { status: 400 });
  }

  await setIssueStatus(body.issueId, stateId);
  revalidateDashboard();
  return NextResponse.json({ ok: true });
}
