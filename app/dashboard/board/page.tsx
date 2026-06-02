import { cookies } from 'next/headers';
import { getAllMembers, currentWeekStart } from '@/lib/supabase';
import { getIssuesForUser, getCompletedIssuesSince } from '@/lib/linear';
import { listUserKpis } from '@/lib/kpis';
import { backlogEnabledForMember } from '@/lib/backlog-access';
import { mergeTasks, mergeDoneTasks, mergeBacklogTasks } from '@/lib/unified-tasks';
import { getActiveSessionsByIdentifier } from '@/lib/claude-sessions';
import type { ClaudeSession } from '@/types';
import { KanbanBoard } from '@/components/dashboard/KanbanBoard';
import { KanbanRealtimeListener } from '@/components/dashboard/KanbanRealtimeListener';
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

  const now = new Date();
  const since14 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

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
  const backlogEnabled = backlogEnabledForMember(me.id);
  const backlogTasks = backlogEnabled ? mergeBacklogTasks(steps, projects) : [];

  // Live Claude-Code session tracking (KAL-89). Best-effort — if the table
  // hasn't been migrated yet on this environment, the board still renders.
  const identifiers = tasks.map((t) => t.identifier).filter((x): x is string => !!x);
  let activeClaudeByIdentifier: Record<string, ClaudeSession[]> = {};
  try {
    const map = await getActiveSessionsByIdentifier(identifiers);
    activeClaudeByIdentifier = Object.fromEntries(map);
  } catch (err) {
    console.warn('[board] claude_sessions lookup failed (table missing?):', err);
  }

  return (
    <>
      <KanbanRealtimeListener />
      <ViewToggle currentView="board" memberId={me.id} />
      <KanbanBoard
        tasks={tasks}
        doneTasks={doneTasks}
        backlogTasks={backlogTasks}
        backlogEnabled={backlogEnabled}
        members={members}
        activeClaudeByIdentifier={activeClaudeByIdentifier}
      />
    </>
  );
}
