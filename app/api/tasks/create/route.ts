import { NextRequest, NextResponse } from 'next/server';
import { createIssue, getLinearTeamId } from '@/lib/linear';
import { requireApiAuth } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  if (!requireApiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body?.title || typeof body.title !== 'string' || !body.title.trim()) {
    return NextResponse.json({ error: 'title required' }, { status: 400 });
  }
  const { title, assigneeId, userId } = body as {
    title: string;
    assigneeId?: string;
    userId?: string;
  };

  let resolvedAssignee = assigneeId;
  if (!resolvedAssignee && userId) {
    const { data, error } = await supabaseAdmin
      .from('team_members')
      .select('linear_user_id')
      .eq('id', userId)
      .single();
    if (error) return NextResponse.json({ error: 'member not found' }, { status: 404 });
    resolvedAssignee = data?.linear_user_id ?? undefined;
  }

  const teamId = await getLinearTeamId();
  const issue = await createIssue(teamId, title.trim(), resolvedAssignee);
  return NextResponse.json(issue);
}
