import { cookies } from 'next/headers';
import { getAllMembers, currentWeekStart } from '@/lib/supabase';
import { getIssuesForUser, getCompletedIssuesSince } from '@/lib/linear';
import { listUserKpis } from '@/lib/kpis';
import { mergeTasks, mergeDoneTasks } from '@/lib/unified-tasks';
import { getTaskMetaByIssueIds } from '@/lib/task-meta-db';
import { getTaskAssistByIssueIds } from '@/lib/task-assist-db';
import { isFelixMemberId } from '@/lib/agent-access';
import type { TaskMeta } from '@/lib/task-meta';
import type { TaskAssist } from '@/lib/task-assist';
import { getActiveSessionsByIdentifier } from '@/lib/claude-sessions';
import { getSubtasksForIssues } from '@/lib/task-subtasks';
import type { ClaudeSession } from '@/types';
import { PlanBoard } from '@/components/dashboard/PlanBoard';
import { KanbanRealtimeListener } from '@/components/dashboard/KanbanRealtimeListener';

const ACTIVE_MEMBER_COOKIE = 'kalkulai-active-member';

export const dynamic = 'force-dynamic';

export default async function PlanPage({
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

  const metaEnabled = isFelixMemberId(me.id);
  let metaByIssueId: Record<string, TaskMeta> = {};
  let assistByIssueId: Record<string, TaskAssist> = {};
  if (metaEnabled) {
    try {
      const ids = issues.map((i) => i.id);
      [metaByIssueId, assistByIssueId] = await Promise.all([
        getTaskMetaByIssueIds(ids),
        getTaskAssistByIssueIds(ids),
      ]);
    } catch (err) {
      console.warn('[plan] task_meta/assist lookup failed:', err);
    }
  }

  const tasks = mergeTasks(issues, steps, projects, metaByIssueId, assistByIssueId);

  let subtasksByIssueId: Record<string, import('@/types').TaskSubtask[]> = {};
  try {
    const linearIds = tasks.filter((t) => t.kind === 'linear').map((t) => t.id);
    subtasksByIssueId = await getSubtasksForIssues(linearIds);
  } catch (err) {
    console.warn('[plan] subtasks lookup failed:', err);
  }
  const tasksWithSubtasks = tasks.map((t) => {
    const subs = subtasksByIssueId[t.id];
    if (!subs?.length) return t;
    return {
      ...t,
      subtasks: subs,
      subtaskCount: { total: subs.length, done: subs.filter((s) => s.completed).length },
    };
  });

  const projectOptions = projects.map((p) => ({ id: p.id, name: p.name }));
  const doneTasks = mergeDoneTasks(completedLinear, completedSteps, projects, 3);

  const identifiers = tasksWithSubtasks.map((t) => t.identifier).filter((x): x is string => !!x);
  let activeClaudeByIdentifier: Record<string, ClaudeSession[]> = {};
  try {
    const map = await getActiveSessionsByIdentifier(identifiers);
    activeClaudeByIdentifier = Object.fromEntries(map);
  } catch (err) {
    console.warn('[plan] claude_sessions lookup failed:', err);
  }

  return (
    <>
      <KanbanRealtimeListener />
      <PlanBoard
        allTasks={tasksWithSubtasks}
        doneTasks={doneTasks}
        members={members}
        metaEnabled={metaEnabled}
        projects={projectOptions}
        activeClaudeByIdentifier={activeClaudeByIdentifier}
      />
    </>
  );
}
