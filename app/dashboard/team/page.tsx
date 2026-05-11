import { MemberCard } from '@/components/MemberCard';
import { TeamBranchSection } from '@/components/TeamBranchSection';
import type { RingDatum } from '@/components/MultiRingChart';
import { getActiveBranches, getRecentlyMergedPRs } from '@/lib/github';
import { getAllActiveIssues } from '@/lib/linear';
import { getAllMembers, currentWeekStart } from '@/lib/supabase';
import { listUserKpis } from '@/lib/kpis';
import { buildActivityFeed } from '@/lib/activity';
import { getTodayEvents } from '@/lib/calendar';
import type { GitHubBranch, KpiWithWeek, TeamMember } from '@/types';

export const dynamic = 'force-dynamic';

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

export default async function TeamPage() {
  const [allBranches, activeIssues, members, mergedPRs] = await Promise.all([
    getActiveBranches({ withPRMeta: true }),
    getAllActiveIssues(),
    getAllMembers(),
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
  );
}
