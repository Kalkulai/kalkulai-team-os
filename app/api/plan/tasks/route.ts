import { NextRequest, NextResponse } from 'next/server';
import { requireActor } from '@/lib/auth-context';
import { getIssuesForUser, createIssue, getLinearTeamId, setIssueStatus, archiveIssue } from '@/lib/linear';
import { supabaseAdmin } from '@/lib/supabase';
import { getTaskMetaByIssueIds, upsertTaskMeta } from '@/lib/task-meta-db';
import { revalidateDashboard } from '@/lib/revalidate';
import type { TaskBereich } from '@/lib/task-meta';

const VALID_BEREICHE = ['dashboard','angebot','planung','kommunikation','ma_mobil','allgemein'];

const STATUS_TO_STATE: Record<string, string | undefined> = {
  'in_progress':  process.env.LINEAR_IN_PROGRESS_STATE_ID,
  'in-progress':  process.env.LINEAR_IN_PROGRESS_STATE_ID,
  'todo':         process.env.LINEAR_TODO_STATE_ID,
  'on_hold':      process.env.LINEAR_ON_HOLD_STATE_ID ?? process.env.LINEAR_IN_PROGRESS_STATE_ID,
  'on-hold':      process.env.LINEAR_ON_HOLD_STATE_ID ?? process.env.LINEAR_IN_PROGRESS_STATE_ID,
  'backlog':      process.env.LINEAR_TODO_STATE_ID,
};

/**
 * GET /api/plan/tasks?userId=&phase=&bereich=&status=
 *
 * Hermes-friendly read: returns plan tasks (Linear issues where meta.phase is set)
 * for the given team member. Supports optional filters.
 */
export async function GET(req: NextRequest) {
  const actor = await requireActor(req, { allowMember: true });
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const userId = params.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });
  if (actor.type === 'member' && actor.memberId !== userId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const phaseFilter = params.get('phase') ? Number(params.get('phase')) : null;
  const bereichFilter = params.get('bereich') ?? null;
  const statusFilter = params.get('status') ?? null;

  const { data: member, error: mErr } = await supabaseAdmin
    .from('team_members')
    .select('id, linear_user_id')
    .eq('id', userId)
    .single();
  if (mErr || !member?.linear_user_id) {
    return NextResponse.json({ error: 'member not found or no linear_user_id' }, { status: 404 });
  }

  const issues = await getIssuesForUser(member.linear_user_id);
  const meta = await getTaskMetaByIssueIds(issues.map((i) => i.id));

  const tasks = issues
    .filter((i) => {
      const m = meta[i.id];
      if (!m?.phase) return false;                                     // only plan tasks
      if (phaseFilter !== null && m.phase !== phaseFilter) return false;
      if (bereichFilter && m.bereich !== bereichFilter) return false;
      return true;
    })
    .map((i) => {
      const m = meta[i.id];
      let status: string = i.state.type;
      if (i.state.type === 'completed' || i.state.type === 'cancelled') status = 'done';
      else if (/hold|block/i.test(i.state.name)) status = 'on_hold';
      else if (i.state.type === 'started') status = 'in_progress';
      else status = 'todo';

      if (statusFilter && status !== statusFilter && status.replace('_', '-') !== statusFilter) {
        return null;
      }

      return {
        id: i.id,
        kind: 'linear' as const,
        identifier: i.identifier ?? null,
        title: i.title,
        url: `https://linear.app/issue/${i.identifier}`,
        status,
        priority: i.priority ?? 0,
        dueDate: i.dueDate ?? null,
        phase: m?.phase ?? null,
        bereich: m?.bereich ?? null,
        owner: userId,
        source_kpi_id: null,  // reserved for future sync tracking
      };
    })
    .filter((t): t is NonNullable<typeof t> => t !== null)
    .sort((a, b) => (a.phase ?? 0) - (b.phase ?? 0) || a.title.localeCompare(b.title));

  return NextResponse.json({ tasks, count: tasks.length });
}

/**
 * POST /api/plan/tasks
 *
 * Create a plan task: a Linear issue with phase + bereich set in task_meta.
 * Auth: Bearer (DASHBOARD_API_SECRET) or member cookie.
 * ponytail: on meta-write failure the Linear issue is archived to avoid orphans.
 */
export async function POST(req: NextRequest) {
  const actor = await requireActor(req, { allowMember: true, scopes: ['tasks:write'] });
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const { userId, title, phase, bereich, status, priority, dueDate } = body ?? {};

  if (!userId || typeof userId !== 'string') {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }
  if (!title || typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'title required' }, { status: 400 });
  }
  if (typeof phase !== 'number' || phase < 1 || phase > 9) {
    return NextResponse.json({ error: 'phase required (1–9)' }, { status: 400 });
  }
  if (!bereich || !VALID_BEREICHE.includes(bereich)) {
    return NextResponse.json({ error: `bereich required: one of ${VALID_BEREICHE.join(', ')}` }, { status: 400 });
  }

  const { data: member, error: mErr } = await supabaseAdmin
    .from('team_members')
    .select('id, linear_user_id')
    .eq('id', userId)
    .single();
  if (mErr || !member?.linear_user_id) {
    return NextResponse.json({ error: 'member not found or no linear_user_id' }, { status: 404 });
  }

  const teamId = await getLinearTeamId();
  const stateId = status ? STATUS_TO_STATE[status] : undefined;

  const issue = await createIssue(
    teamId,
    title.trim(),
    member.linear_user_id,
    [],
    priority ?? undefined,
    dueDate ?? null,
  );
  if (stateId) await setIssueStatus(issue.id, stateId);

  try {
    await upsertTaskMeta(issue.id, userId, {
      context: 'business',
      effortMinutes: null,
      important: false,
      urgent: false,
      energy: null,
      projectId: null,
      fixed: false,
      phase,
      bereich: bereich as TaskBereich,
    });
  } catch (err) {
    // Roll back the Linear issue to avoid orphaned tasks without plan metadata.
    await archiveIssue(issue.id).catch(() => {});
    throw err;
  }

  revalidateDashboard();

  return NextResponse.json({
    id: issue.id,
    kind: 'linear',
    identifier: issue.identifier ?? null,
    title: issue.title,
    status: status ?? 'todo',
    phase,
    bereich,
    owner: userId,
    source_kpi_id: null,
  }, { status: 201 });
}
