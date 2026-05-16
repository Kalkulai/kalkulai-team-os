import { cookies } from 'next/headers';
import { getAllMembers, currentWeekStart } from '@/lib/supabase';
import { getIssuesForUser, getCompletedIssuesSince } from '@/lib/linear';
import { listUserKpis } from '@/lib/kpis';
import { mergeTasks, mergeDoneTasks } from '@/lib/unified-tasks';
import { KanbanBoard } from '@/components/dashboard/KanbanBoard';
import { ViewToggle } from '@/components/dashboard/ViewToggle';

const ACTIVE_MEMBER_COOKIE = 'kalkulai-active-member';

export const dynamic = 'force-dynamic';

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ member?: string }>;
}) {
  const [members, params, cookieStore] = await Promise.all([
    getAllMembers(),
    searchParams,
    cookies(),
  ]);

  if (!members.length) {
    return (
      <p className="text-[13px] text-[var(--ink-3)]">
        Keine Teammitglieder konfiguriert.
      </p>
    );
  }

  const fromCookie = cookieStore.get(ACTIVE_MEMBER_COOKIE)?.value;
  const me =
    members.find((m) => m.id === params.member) ??
    members.find((m) => m.id === fromCookie) ??
    members[0];

  const since14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const [issues, allKpis, completedLinear] = await Promise.all([
    me.linear_user_id ? getIssuesForUser(me.linear_user_id) : Promise.resolve([]),
    listUserKpis(me.id, currentWeekStart()),
    me.linear_user_id ? getCompletedIssuesSince(me.linear_user_id, since14) : Promise.resolve([]),
  ]);

  const steps = allKpis.filter((k) => k.type === 'step' && !k.completed);
  const completedSteps = allKpis.filter((k) => k.type === 'step' && k.completed);
  const projects = allKpis.filter((k) => k.type === 'project');
  const tasks = mergeTasks(issues, steps, projects);
  const doneTasks = mergeDoneTasks(completedLinear, completedSteps, projects, 3);

  return (
    <>
      <ViewToggle currentView="board" memberId={me.id} />
      <KanbanBoard tasks={tasks} doneTasks={doneTasks} />
    </>
  );
}
