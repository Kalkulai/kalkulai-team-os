import { cookies } from 'next/headers';
import { getAllMembers, currentWeekStart } from '@/lib/supabase';
import { getIssuesForUser, getCompletedIssuesSince } from '@/lib/linear';
import { listUserKpis } from '@/lib/kpis';
import { backlogEnabledForMember } from '@/lib/backlog-access';
import { mergeTasks, mergeDoneTasks, mergeBacklogTasks } from '@/lib/unified-tasks';
import { getTaskMetaByIssueIds } from '@/lib/task-meta-db';
import { getTaskAssistByIssueIds } from '@/lib/task-assist-db';
import { isFelixMemberId } from '@/lib/agent-access';
import type { TaskMeta } from '@/lib/task-meta';
import type { TaskAssist } from '@/lib/task-assist';
import { getActiveSessionsByIdentifier } from '@/lib/claude-sessions';
import { getSubtaskCountsForIssues } from '@/lib/task-subtasks';
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

  // Felix-only planning metadata (context/effort/Eisenhower/energy/project/fixed).
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
      console.warn('[board] task_meta/assist lookup failed (table missing?):', err);
    }
  }

  const tasks = mergeTasks(issues, steps, projects, metaByIssueId, assistByIssueId);

  // Subtask progress counts for the board cards.
  let subtaskCountsById: Record<string, { total: number; done: number }> = {};
  try {
    const linearIds = tasks.filter((t) => t.kind === 'linear').map((t) => t.id);
    subtaskCountsById = await getSubtaskCountsForIssues(linearIds);
  } catch (err) {
    console.warn('[board] subtask_counts lookup failed (table missing?):', err);
  }
  const tasksWithSubtasks = tasks.map((t) =>
    subtaskCountsById[t.id] ? { ...t, subtaskCount: subtaskCountsById[t.id] } : t,
  );
  const projectOptions = projects.map((p) => ({ id: p.id, name: p.name }));
  const doneTasks = mergeDoneTasks(completedLinear, completedSteps, projects, 3);
  const backlogEnabled = backlogEnabledForMember(me.id);
  const backlogTasks = backlogEnabled ? mergeBacklogTasks(steps, projects) : [];

  // Live Claude-Code session tracking (KAL-89). Best-effort — if the table
  // hasn't been migrated yet on this environment, the board still renders.
  const identifiers = tasksWithSubtasks.map((t) => t.identifier).filter((x): x is string => !!x);
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
        tasks={tasksWithSubtasks}
        doneTasks={doneTasks}
        backlogTasks={backlogTasks}
        backlogEnabled={backlogEnabled}
        members={members}
        activeClaudeByIdentifier={activeClaudeByIdentifier}
        metaEnabled={metaEnabled}
        projects={projectOptions}
      />
    </>
  );
}
