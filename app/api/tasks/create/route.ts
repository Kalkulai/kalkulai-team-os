import { NextRequest, NextResponse } from 'next/server';
import { createIssue, ensureLabelId, getLinearTeamId } from '@/lib/linear';
import { requireApiAuth } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { buildTeamTaskDescription } from '@/lib/team-tasks';

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
  const {
    title,
    assigneeId,
    userId,
    assigneeUserIds,
    teamWide,
    source,
    priority,
    dueDate,
  } = body as {
    title: string;
    assigneeId?: string;
    userId?: string;
    assigneeUserIds?: string[];
    teamWide?: boolean;
    source?: 'hermes' | 'notion' | 'linear';
    priority?: number;
    dueDate?: string | null;
  };

  try {
    const teamId = await getLinearTeamId();

    const labelIds: string[] = [];
    if (source === 'hermes' || source === 'notion') {
      const labelId = await ensureLabelId(teamId, SOURCE_LABEL[source]);
      labelIds.push(labelId);
    }

    // ── Multi-assignee path ─────────────────────────────────────────────
    const isMulti = teamWide || (Array.isArray(assigneeUserIds) && assigneeUserIds.length > 0);

    if (isMulti) {
      let targetUserIds: string[] = Array.isArray(assigneeUserIds) ? [...assigneeUserIds] : [];
      if (teamWide) {
        const { data } = await supabaseAdmin
          .from('team_members')
          .select('id, linear_user_id')
          .not('linear_user_id', 'is', null);
        targetUserIds = (data ?? []).map((m: { id: string }) => m.id);
      }

      const { data: members } = await supabaseAdmin
        .from('team_members')
        .select('id, linear_user_id')
        .in('id', targetUserIds);

      const linearIds = (members ?? [])
        .map((m: { id: string; linear_user_id: string | null }) => m.linear_user_id)
        .filter((id): id is string => id !== null);

      if (linearIds.length === 0) {
        return NextResponse.json(
          { error: 'Keine Assignees mit linear_user_id gefunden.' },
          { status: 400 },
        );
      }

      const teamTaskLabel = await ensureLabelId(teamId, 'Team-Task');
      if (!labelIds.includes(teamTaskLabel)) labelIds.push(teamTaskLabel);

      const groupId = crypto.randomUUID();
      const description = buildTeamTaskDescription(groupId, targetUserIds);

      const tasks = await Promise.all(
        linearIds.map((linearId) =>
          createIssue(teamId, title.trim(), linearId, labelIds, priority, dueDate ?? null, description),
        ),
      );
      return NextResponse.json({ tasks, teamTaskGroupId: groupId });
    }

    // ── Single-assignee path (unchanged) ────────────────────────────────
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
