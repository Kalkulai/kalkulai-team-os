import { NextRequest, NextResponse } from 'next/server';
import { createIssue, ensureLabelId, getLinearTeamId } from '@/lib/linear';
import { requireApiAuth } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';

const SOURCE_LABEL: Record<'hermes' | 'notion', string> = {
  hermes: 'Hermes',
  notion: 'Notion',
};

export async function POST(req: NextRequest) {
  if (!requireApiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body?.title || typeof body.title !== 'string' || !body.title.trim()) {
    return NextResponse.json({ error: 'title required' }, { status: 400 });
  }
  const { title, assigneeId, userId, source, priority, dueDate } = body as {
    title: string;
    assigneeId?: string;
    userId?: string;
    source?: 'hermes' | 'notion' | 'linear';
    priority?: number;
    dueDate?: string | null;
  };

  try {
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
    if (!resolvedAssignee) {
      return NextResponse.json(
        { error: 'Kein linear_user_id für dieses Mitglied gesetzt — Task würde unassigned erstellt und im Dashboard nicht erscheinen.' },
        { status: 400 },
      );
    }

    const teamId = await getLinearTeamId();

    const labelIds: string[] = [];
    if (source === 'hermes' || source === 'notion') {
      const labelId = await ensureLabelId(teamId, SOURCE_LABEL[source]);
      labelIds.push(labelId);
    }

    const issue = await createIssue(
      teamId,
      title.trim(),
      resolvedAssignee,
      labelIds,
      priority,
      dueDate ?? null,
    );
    return NextResponse.json(issue);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[/api/tasks/create] Linear-Fehler:', message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
