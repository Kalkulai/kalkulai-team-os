import { NextRequest, NextResponse } from 'next/server';
import { requireActor } from '@/lib/auth-context';
import { createIssue, archiveIssue, getIssuesForUser, getLinearTeamId, setIssueStatus } from '@/lib/linear';
import { supabaseAdmin, currentWeekStart } from '@/lib/supabase';
import { listUserKpis } from '@/lib/kpis';
import { getTaskMetaByIssueIds, upsertTaskMeta } from '@/lib/task-meta-db';
import { revalidateDashboard } from '@/lib/revalidate';
import type { TaskBereich } from '@/lib/task-meta';

const VALID_BEREICHE = ['dashboard','angebot','planung','kommunikation','ma_mobil','allgemein'];

const KPI_STATUS_MAP: Record<string, string> = {
  'backlog':     'backlog',
  'todo':        'todo',
  'in-progress': 'in_progress',
  'in_progress': 'in_progress',
  'on-hold':     'on_hold',
  'done':        'done',
};

const STATUS_TO_STATE: Record<string, string | undefined> = {
  'in_progress': process.env.LINEAR_IN_PROGRESS_STATE_ID,
  'todo':        process.env.LINEAR_TODO_STATE_ID,
  'on_hold':     process.env.LINEAR_ON_HOLD_STATE_ID ?? process.env.LINEAR_IN_PROGRESS_STATE_ID,
  'backlog':     process.env.LINEAR_TODO_STATE_ID,
};

/**
 * POST /api/plan/sync-from-kpis
 *
 * Mirrors KPI steps for a user into plan tasks (Linear issues with task_meta).
 * Steps already reflected in an existing Linear task (matched by title) are skipped.
 *
 * Body:
 *   userId   — Supabase team_members.id
 *   phase    — target phase for synced tasks (1–9)
 *   bereich  — target area (dashboard|angebot|planung|kommunikation|ma_mobil|allgemein)
 *   projectFilter? — optional KPI project name substring to narrow which steps to sync
 *   dryRun?  — if true, return what would be created without writing
 */
export async function POST(req: NextRequest) {
  const actor = await requireActor(req, { allowMember: true, scopes: ['tasks:write'] });
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const { userId, phase, bereich, projectFilter, dryRun } = body ?? {};

  if (!userId || typeof userId !== 'string') {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }
  // Tenant isolation: members can only sync their own plan.
  if (actor.type === 'member' && actor.memberId !== userId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (typeof phase !== 'number' || phase < 1 || phase > 9) {
    return NextResponse.json({ error: 'phase required (1–9)' }, { status: 400 });
  }
  if (!bereich || !VALID_BEREICHE.includes(bereich)) {
    return NextResponse.json({ error: `bereich required: one of ${VALID_BEREICHE.join(', ')}` }, { status: 400 });
  }

  const { data: member } = await supabaseAdmin
    .from('team_members')
    .select('id, linear_user_id')
    .eq('id', userId)
    .single();
  if (!member?.linear_user_id) {
    return NextResponse.json({ error: 'member not found or no linear_user_id' }, { status: 404 });
  }

  // Load KPI steps for the user
  const allKpis = await listUserKpis(userId, currentWeekStart());
  const projects = allKpis.filter((k) => k.type === 'project');
  const projectMap = new Map(projects.map((p) => [p.id, p.name]));

  const steps = allKpis.filter((k) => {
    if (k.type !== 'step') return false;
    if (k.completed) return false;
    if (projectFilter && k.parent_id) {
      const pname = projectMap.get(k.parent_id) ?? '';
      if (!pname.toLowerCase().includes(String(projectFilter).toLowerCase())) return false;
    }
    return true;
  });

  if (steps.length === 0) {
    return NextResponse.json({ created: 0, skipped: 0, tasks: [], message: 'No matching steps found' });
  }

  // Load existing Linear issues to detect duplicates (match by title)
  const existing = await getIssuesForUser(member.linear_user_id);
  const existingMeta = await getTaskMetaByIssueIds(existing.map((i) => i.id));
  // Dedup against ALL existing issues by title (not just plan-tagged ones) to avoid
  // creating duplicates when a prior sync failed after Linear-issue creation.
  const existingByTitle = new Map(existing.map((i) => [i.title.trim().toLowerCase(), i]));
  const existingPlanTitles = new Set(existingByTitle.keys());

  if (dryRun) {
    const toCreate = steps.filter((s) => !existingPlanTitles.has(s.name.trim().toLowerCase()));
    const toSkip = steps.length - toCreate.length;
    return NextResponse.json({
      dryRun: true,
      toCreate: toCreate.map((s) => ({
        title: s.name,
        status: KPI_STATUS_MAP[s.status ?? 'backlog'] ?? 'backlog',
        source_kpi_id: s.id,
        project: s.parent_id ? projectMap.get(s.parent_id) ?? null : null,
      })),
      toSkip,
    });
  }

  const teamId = await getLinearTeamId();
  const created: Array<{ id: string; identifier: string | null; title: string; source_kpi_id: string }> = [];
  const skipped: string[] = [];

  for (const step of steps) {
    const titleKey = step.name.trim().toLowerCase();
    const existingIssue = existingByTitle.get(titleKey);
    if (existingIssue) {
      // Issue exists — tag it with phase/bereich if it doesn't have them yet.
      const existingIssueMeta = existingMeta[existingIssue.id];
      if (existingIssueMeta?.phase !== undefined && existingIssueMeta?.phase !== null) {
        skipped.push(step.name);
        continue;
      }
      // Tag the existing issue (avoid duplicate; repair orphan from failed prior sync).
      // Merge into existing meta so we don't wipe user-set fields (important, effortMinutes…).
      await upsertTaskMeta(existingIssue.id, userId, {
        context: existingIssueMeta?.context ?? 'business',
        effortMinutes: existingIssueMeta?.effortMinutes ?? null,
        important: existingIssueMeta?.important ?? false,
        urgent: existingIssueMeta?.urgent ?? false,
        energy: existingIssueMeta?.energy ?? null,
        projectId: existingIssueMeta?.projectId ?? null,
        fixed: existingIssueMeta?.fixed ?? false,
        phase,
        bereich: bereich as TaskBereich,
      });
      created.push({ id: existingIssue.id, identifier: existingIssue.identifier ?? null, title: existingIssue.title, source_kpi_id: step.id });
      continue;
    }

    const kpiStatus = KPI_STATUS_MAP[step.status ?? 'backlog'] ?? 'backlog';
    const stateId = STATUS_TO_STATE[kpiStatus];
    const projectName = step.parent_id ? projectMap.get(step.parent_id) : undefined;
    const description = projectName
      ? `Gespiegelt aus KPI-Step: ${projectName} → ${step.name}\n\n<!-- source-kpi-id: ${step.id} -->`
      : `Gespiegelt aus KPI-Step: ${step.name}\n\n<!-- source-kpi-id: ${step.id} -->`;

    const issue = await createIssue(
      teamId,
      step.name.trim(),
      member.linear_user_id,
      [],
      undefined,
      step.due_date ?? null,
      description,
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
      await archiveIssue(issue.id).catch(() => {});
      throw err;
    }

    created.push({ id: issue.id, identifier: issue.identifier ?? null, title: issue.title, source_kpi_id: step.id });
    existingByTitle.set(titleKey, issue); // prevent duplicate within same sync run
  }

  revalidateDashboard();
  return NextResponse.json({
    created: created.length,
    skipped: skipped.length,
    tasks: created,
  });
}
