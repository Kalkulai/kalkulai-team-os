import { NextRequest, NextResponse } from 'next/server';
import { createIssue, getLinearTeamId } from '@/lib/linear';
import { requireApiAuth } from '@/lib/api-auth';

export async function POST(req: NextRequest) {
  if (!requireApiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body?.title || typeof body.title !== 'string') {
    return NextResponse.json({ error: 'title required' }, { status: 400 });
  }
  const { title, assigneeId } = body as { title: string; assigneeId?: string };
  const teamId = await getLinearTeamId();
  const issue = await createIssue(teamId, title, assigneeId);
  return NextResponse.json(issue);
}
