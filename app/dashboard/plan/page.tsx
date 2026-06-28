import { cookies } from 'next/headers';
import { getAllMembers, currentWeekStart } from '@/lib/supabase';
import { getIssuesForUser, getCompletedIssuesSince, getAllActiveIssues } from '@/lib/linear';
import { listUserKpis } from '@/lib/kpis';
import { mergeTasks, mergeDoneTasks } from '@/lib/unified-tasks';
import { getTaskMetaByIssueIds } from '@/lib/task-meta-db';
import { getTaskAssistByIssueIds } from '@/lib/task-assist-db';
import { isFelixMemberId } from '@/lib/agent-access';
import type { TaskMeta } from '@/lib/task-meta';
import type { TaskAssist } from '@/lib/task-assist';
import { getActiveSessionsByIdentifier } from '@/lib/claude-sessions';
import { getSubtasksForIssues } from '@/lib/task-subtasks';
import type { ClaudeSession, GitHubBranch, KpiWithWeek, TeamMember } from '@/types';
import { PlanBoard } from '@/components/dashboard/PlanBoard';
import { PlanPageTabs } from '@/components/dashboard/PlanPageTabs';
import { KanbanRealtimeListener } from '@/components/dashboard/KanbanRealtimeListener';
import { MemberCard } from '@/components/MemberCard';
import { TeamBranchSection } from '@/components/TeamBranchSection';
import type { RingDatum } from '@/components/MultiRingChart';
import { getActiveBranches, getRecentlyMergedPRs } from '@/lib/github';
import { buildActivityFeed } from '@/lib/activity';
import { getTodayEvents } from '@/lib/calendar';

const ACTIVE_MEMBER_COOKIE = 'kalkulai-active-member';

export const dynamic = 'force-dynamic';

// ── Team tab helpers (copied from team/page.tsx) ────────────────────────────

const MAX_RINGS = 6;

function buildRings(all: KpiWithWeek[]): RingDatum[] {
  const counters = all.filter((k) => k.type === 'counter' && (k.target > 0 || k.actual > 0));
  const projects = all.filter((k) => k.type === 'project');
  const stepsByParent = new Map<string, KpiWithWeek[]>();
  for (const s of all.filter((k) => k.type === 'step')) {
    if (!s.parent_id) continue;
    const arr = stepsByParent.get(s.parent_id) ?? [];
    arr.push(s);
    stepsByParent.set(s.parent_id, arr);
  }
  const counterRings: RingDatum[] = counters.map((c) => ({
    id: c.id,
    label: c.unit ? `${c.name} (${c.unit})` : c.name,
    actual: c.actual,
    target: c.target,
  }));
  const projectRings: RingDatum[] = projects
    .map((p) => {
      const steps = stepsByParent.get(p.id) ?? [];
      return {
        id: p.id,
        label: p.name,
        actual: steps.filter((s) => s.completed).length,
        target: steps.length,
      };
    })
    .filter((r) => r.target > 0);
  return [...counterRings, ...projectRings].slice(0, MAX_RINGS);
}

function branchesFor(member: TeamMember, branches: GitHubBranch[]): GitHubBranch[] {
  if (!member.github_username) return [];
  const handle = member.github_username;
  return branches.filter(
    (b) => b.prAssignee === handle || b.prRequestedReviewer === handle || b.authorLogin === handle,
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ member?: string; tab?: string }>;
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

  const tab = params.tab === 'team' ? 'team' : 'plan';

  // ── Team tab ──────────────────────────────────────────────────────────────
  if (tab === 'team') {
    const [allBranches, activeIssues, mergedPRs] = await Promise.all([
      getActiveBranches({ withPRMeta: true }),
      getAllActiveIssues(),
      getRecentlyMergedPRs(2),
    ]);
    const humanBranches = allBranches.filter((b) => !b.isBot);
    const botBranches = allBranches.filter((b) => b.isBot);
    const weekStart = currentWeekStart();
    const cards = await Promise.all(
      members.map(async (m) => {
        const [kpis, meetings] = await Promise.all([
          listUserKpis(m.id, weekStart),
          getTodayEvents(m),
        ]);
        const activity = await buildActivityFeed(m, meetings, mergedPRs);
        return {
          member: m,
          rings: buildRings(kpis),
          branches: branchesFor(m, allBranches),
          activity,
          activeTasks: activeIssues.filter((i) => i.assignee?.id === m.linear_user_id).length,
        };
      }),
    );

    return (
      <>
        <PlanPageTabs active="team" memberParam={params.member} />
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-[18px] md:grid-cols-2 xl:grid-cols-3">
            {cards.map(({ member, rings, branches, activity, activeTasks }) => (
              <MemberCard
                key={member.id}
                member={member}
                rings={rings}
                branches={branches}
                activity={activity}
                activeTasks={activeTasks}
              />
            ))}
          </div>
          <TeamBranchSection branches={humanBranches} bots={botBranches} members={members} />
        </div>
      </>
    );
  }

  // ── Plan tab ──────────────────────────────────────────────────────────────
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
    me.linear_user_id
      ? getCompletedIssuesSince(me.linear_user_id, since14)
      : Promise.resolve([]),
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

  const identifiers = tasksWithSubtasks
    .map((t) => t.identifier)
    .filter((x): x is string => !!x);
  let activeClaudeByIdentifier: Record<string, ClaudeSession[]> = {};
  try {
    const map = await getActiveSessionsByIdentifier(identifiers);
    activeClaudeByIdentifier = Object.fromEntries(map);
  } catch (err) {
    console.warn('[plan] claude_sessions lookup failed:', err);
  }

  return (
    <>
      <PlanPageTabs active="plan" memberParam={params.member} />
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
