import { NextRequest, NextResponse } from 'next/server';
import { setIssueStatus } from '@/lib/linear';

export async function POST(req: NextRequest) {
  const { issueId } = (await req.json()) as { issueId: string };
  await setIssueStatus(issueId, process.env.LINEAR_DONE_STATE_ID!);
  return NextResponse.json({ ok: true });
}
