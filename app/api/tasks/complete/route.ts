import { NextRequest, NextResponse } from 'next/server';
import { getIssueByIdentifier, setIssueStatus } from '@/lib/linear';
import { requireApiAuth } from '@/lib/api-auth';
import { revalidateDashboard } from '@/lib/revalidate';

export async function POST(req: NextRequest) {
  if (!requireApiAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);

  const stateId = process.env.LINEAR_DONE_STATE_ID;
  if (!stateId) {
    return NextResponse.json({ error: 'LINEAR_DONE_STATE_ID not configured' }, { status: 500 });
  }

  // Accept either issueId (UUID) or identifier (KAL-XX)
  if (body?.issueId && typeof body.issueId === 'string') {
    await setIssueStatus(body.issueId, stateId);
    revalidateDashboard();
    return NextResponse.json({ ok: true });
  }

  if (body?.identifier && typeof body.identifier === 'string') {
    if (!/^[A-Z]{2,5}-\d{1,6}$/i.test(body.identifier)) {
      return NextResponse.json({ error: 'identifier must match KAL-XX format' }, { status: 400 });
    }
    const issue = await getIssueByIdentifier(body.identifier.toUpperCase()).catch(() => null);
    if (!issue) {
      return NextResponse.json({ error: 'issue not found', identifier: body.identifier }, { status: 404 });
    }
    await setIssueStatus(issue.id, stateId);
    revalidateDashboard();
    return NextResponse.json({ ok: true, identifier: issue.identifier, issueId: issue.id });
  }

  return NextResponse.json({ error: 'issueId or identifier required' }, { status: 400 });
}
