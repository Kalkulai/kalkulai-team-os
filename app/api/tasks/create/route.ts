import { NextRequest, NextResponse } from 'next/server';
import { createIssue, getLinearTeamId } from '@/lib/linear';
import { requireApiAuth } from '@/lib/api-auth';

export async function POST(req: NextRequest) {
  if (!requireApiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { title, assigneeId } = (await req.json()) as { title: string; assigneeId?: string };
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });
  const teamId = await getLinearTeamId();
  const issue = await createIssue(teamId, title, assigneeId);
  return NextResponse.json(issue);
}
