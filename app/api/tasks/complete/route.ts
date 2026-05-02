import { NextRequest, NextResponse } from 'next/server';
import { setIssueStatus } from '@/lib/linear';
import { requireApiAuth } from '@/lib/api-auth';

export async function POST(req: NextRequest) {
  if (!requireApiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body?.issueId || typeof body.issueId !== 'string') {
    return NextResponse.json({ error: 'issueId required' }, { status: 400 });
  }
  const stateId = process.env.LINEAR_DONE_STATE_ID;
  if (!stateId) return NextResponse.json({ error: 'LINEAR_DONE_STATE_ID not configured' }, { status: 500 });
  await setIssueStatus(body.issueId, stateId);
  return NextResponse.json({ ok: true });
}
