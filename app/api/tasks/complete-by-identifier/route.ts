import { NextRequest, NextResponse } from 'next/server';
import { getIssueByIdentifier, setIssueStatus } from '@/lib/linear';
import { requireApiAuth } from '@/lib/api-auth';
import { revalidateDashboard } from '@/lib/revalidate';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!requireApiAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const identifier = body?.identifier;
  if (typeof identifier !== 'string' || !/^[A-Z]{2,5}-\d{1,6}$/i.test(identifier)) {
    return NextResponse.json({ error: 'identifier required (e.g. KAL-42)' }, { status: 400 });
  }

  const stateId = process.env.LINEAR_DONE_STATE_ID;
  if (!stateId) {
    return NextResponse.json({ error: 'LINEAR_DONE_STATE_ID not configured' }, { status: 500 });
  }

  const issue = await getIssueByIdentifier(identifier.toUpperCase()).catch(() => null);
  if (!issue) {
    return NextResponse.json({ error: 'issue not found', identifier }, { status: 404 });
  }

  await setIssueStatus(issue.id, stateId);
  revalidateDashboard();
  return NextResponse.json({ ok: true, identifier: issue.identifier, issueId: issue.id });
}
