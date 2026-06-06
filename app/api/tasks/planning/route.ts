import { NextRequest, NextResponse } from 'next/server';
import { requireActor } from '@/lib/auth-context';
import { getAllMembers } from '@/lib/supabase';
import { getIssuesForUser } from '@/lib/linear';
import { listUserKpis } from '@/lib/kpis';
import { currentWeekStart } from '@/lib/supabase';
import { getTodayEvents } from '@/lib/calendar';
import { mergeTasks } from '@/lib/unified-tasks';
import { getTaskMetaByIssueIds } from '@/lib/task-meta-db';
import { getTaskAssistByIssueIds } from '@/lib/task-assist-db';
import { quadrantBadge } from '@/lib/task-meta';

/** Structured day-planning feed for Kai (Hermes): tasks + planning metadata +
 * Kai's own prior suggestions + today's fixed calendar blocks. Read-only.
 * Kai consumes this via curl with its bearer token. */
export async function GET(req: NextRequest) {
  const actor = await requireActor(req, { allowMember: true });
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });
  if (actor.type === 'member' && actor.memberId !== userId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const members = await getAllMembers();
  const me = members.find((m) => m.id === userId);
  if (!me) return NextResponse.json({ error: 'member not found' }, { status: 404 });

  const [issues, allKpis] = await Promise.all([
    me.linear_user_id ? getIssuesForUser(me.linear_user_id) : Promise.resolve([]),
    listUserKpis(me.id, currentWeekStart()),
  ]);
  const steps = allKpis.filter((k) => k.type === 'step' && !k.completed);
  const projects = allKpis.filter((k) => k.type === 'project');
  const projectName = new Map(projects.map((p) => [p.id, p.name] as const));

  const issueIds = issues.map((i) => i.id);
  let metaByIssueId = {};
  let assistByIssueId = {};
  try {
    [metaByIssueId, assistByIssueId] = await Promise.all([
      getTaskMetaByIssueIds(issueIds),
      getTaskAssistByIssueIds(issueIds),
    ]);
  } catch {
    // best-effort — tables may be unmigrated on some envs
  }

  const merged = mergeTasks(issues, steps, projects, metaByIssueId, assistByIssueId).filter(
    (t) => t.kind === 'linear',
  );

  const tasks = merged.map((t) => {
    const m = t.meta ?? null;
    const q = m ? quadrantBadge(m.important, m.urgent) : null;
    return {
      id: t.id,
      identifier: t.identifier ?? null,
      title: t.title,
      status: t.status,
      dueDate: t.dueDate,
      priority: t.priority ?? 0,
      url: t.url ?? null,
      important: m?.important ?? false,
      urgent: m?.urgent ?? false,
      quadrant: q?.label ?? null,
      effortMinutes: m?.effortMinutes ?? null,
      energy: m?.energy ?? null,
      context: m?.context ?? null,
      fixed: m?.fixed ?? false,
      project: m?.projectId
        ? { id: m.projectId, name: projectName.get(m.projectId) ?? null }
        : null,
      assist: t.assist ?? null,
    };
  });

  let meetings: Array<{ start: string; end: string; title: string }> = [];
  try {
    const events = await getTodayEvents(me);
    meetings = events.map((e) => ({ start: e.start, end: e.end, title: e.summary }));
  } catch {
    // calendar optional (member may not have a google token)
  }

  return NextResponse.json({
    date: new Date().toISOString().slice(0, 10),
    timezone: 'Europe/Berlin',
    capacity: { workdayStart: '09:00', workdayEnd: '18:00' },
    tasks,
    meetings,
  });
}
