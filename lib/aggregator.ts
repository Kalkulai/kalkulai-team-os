// lib/aggregator.ts
import type { TeamMember, DailyBriefing, KpiDaily } from '@/types';
import {
  getIssuesForUser,
  getBugsFixedThisWeek,
  getTasksCompletedThisWeek,
} from './linear';
import { getTodayEvents, countSalesCallsToday } from './calendar';
import {
  getActiveBranches,
  getActiveBranchesByAuthor,
  getCommitsThisWeek,
  getGithubHealth,
} from './github';
import type { GitHubBranch } from '@/types';
import { getCallsThisWeek } from './hubspot';
import { getTopUnprocessedInsights } from './notion';
import {
  getWeekTargets,
  getWeekActuals,
  supabaseAdmin,
  currentWeekStart,
  getSalesCallsThisWeek,
} from './supabase';
import { format } from 'date-fns';

export async function buildDailyBriefing(member: TeamMember): Promise<DailyBriefing> {
  const weekStart = currentWeekStart();
  const today = format(new Date(), 'yyyy-MM-dd');

  // Surface GitHub auth state up-front. Silent 401s used to swallow every
  // commit/branch call and leave the dashboard looking empty.
  const ghHealth = await getGithubHealth(member.github_token);
  if (ghHealth !== 'ok') {
    const source = member.github_token ? `${member.name}'s personal PAT` : 'env GITHUB_TOKEN';
    console.error(`[briefing/github] sync disabled for ${member.name}: ${ghHealth} (source: ${source})`);
  }

  const results = await Promise.allSettled([
    member.linear_user_id ? getIssuesForUser(member.linear_user_id) : Promise.resolve([]),
    getTodayEvents(member),
    Promise.all([
      member.github_username
        ? getActiveBranchesByAuthor(member.github_username, 7, member.github_token)
        : Promise.resolve([]),
      getActiveBranches({ withPRMeta: true }),
    ]),
    getWeekTargets(member.id, weekStart),
    getTopUnprocessedInsights(2),
    member.role === 'sales' ? getSalesCallsThisWeek(member.id) : Promise.resolve(0),
    member.role === 'sales' && member.hubspot_owner_id
      ? getCallsThisWeek(member.hubspot_owner_id).then((calls) => calls.length)
      : Promise.resolve(0),
    member.role === 'dev' && member.github_username
      ? getCommitsThisWeek(member.github_username)
      : Promise.resolve(0),
    member.role === 'dev' && member.linear_user_id
      ? getBugsFixedThisWeek(member.linear_user_id)
      : Promise.resolve(0),
    member.linear_user_id
      ? getTasksCompletedThisWeek(member.linear_user_id)
      : Promise.resolve(0),
  ]);

  const tasks = results[0].status === 'fulfilled' ? results[0].value : [];
  const meetings = results[1].status === 'fulfilled' ? results[1].value : [];
  const branchPair =
    results[2].status === 'fulfilled'
      ? (results[2].value as [Awaited<ReturnType<typeof getActiveBranchesByAuthor>>, GitHubBranch[]])
      : ([[], []] as [Awaited<ReturnType<typeof getActiveBranchesByAuthor>>, GitHubBranch[]]);
  const [authoredBranches, repoBranches] = branchPair;

  // Project the events-API result onto the GitHubBranch shape so downstream
  // renderers (briefing, dashboard) keep working unchanged.
  const authoredAsGitHub: GitHubBranch[] = authoredBranches.map((b) => ({
    name: b.name,
    commit: { sha: b.sha ?? '', url: b.url },
    lastCommitDate: b.lastPushAt,
    authorLogin: b.authorLogin,
    repo: b.repo,
    isProtected: b.isProtected,
  }));

  // Merge: prefer REPOS-entry when it exists (carries PR-Meta + bot-detection),
  // fall back to events-API entry otherwise. Key on lowercase(repo-short)#name
  // — owner-agnostic so a repo transfer (Kalkulai/kalkulai →
  // kalkulai-tech/kalkulai) doesn't surface the same branch twice. Collision
  // risk across orgs is acceptable for the active-branch surface.
  const branchesByKey = new Map<string, GitHubBranch>();
  const keyOf = (b: GitHubBranch) => {
    const short = (b.repo ?? '').split('/').pop() ?? '';
    return `${short.toLowerCase()}#${b.name}`;
  };
  for (const b of authoredAsGitHub) branchesByKey.set(keyOf(b), b);
  for (const b of repoBranches) branchesByKey.set(keyOf(b), b);
  const branches = Array.from(branchesByKey.values());
  const weekTargets = results[3].status === 'fulfilled'
    ? results[3].value
    : { tasks_target: 5, calls_target: 0, bugs_target: 0 };
  const unprocessedInsights = results[4].status === 'fulfilled' ? results[4].value : [];
  const salesLogCalls = results[5].status === 'fulfilled' ? (results[5].value as number) : 0;
  const hubspotCalls = results[6].status === 'fulfilled' ? (results[6].value as number) : 0;
  const githubCommits = results[7].status === 'fulfilled' ? results[7].value : 0;
  const bugsFixed = results[8].status === 'fulfilled' ? results[8].value : 0;
  const tasksCompleted = results[9].status === 'fulfilled' ? results[9].value : 0;

  // Sync: Sales-Calls aus Kalender in kpi_daily persistieren
  if (member.role === 'sales' && meetings.length > 0) {
    const salesCallsToday = countSalesCallsToday(meetings);
    if (salesCallsToday > 0) {
      const { error } = await supabaseAdmin.from('kpi_daily').upsert(
        { user_id: member.id, date: today, calls_made: salesCallsToday },
        { onConflict: 'user_id,date' }
      );
      if (error) throw error;
    }
  }

  // Read actuals AFTER sync — DB now reflects today's calendar calls
  const weekActuals: KpiDaily = { ...(await getWeekActuals(member.id, weekStart)) };

  // Tasks completed: Linear is the source of truth (overrides any kpi_daily counter)
  weekActuals.tasks_completed = typeof tasksCompleted === 'number' ? tasksCompleted : 0;

  // Calls = HubSpot CRM-Calls + custom sales_logs cold-calls (handy workflow): in-memory
  weekActuals.calls_made += typeof salesLogCalls === 'number' ? salesLogCalls : 0;
  weekActuals.calls_made += typeof hubspotCalls === 'number' ? hubspotCalls : 0;

  // GitHub commits: not persisted, added in-memory only
  weekActuals.commits_count += typeof githubCommits === 'number' ? githubCommits : 0;

  // Linear bugs fixed (Bug-label issues completed this week): in-memory only
  weekActuals.bugs_fixed += typeof bugsFixed === 'number' ? bugsFixed : 0;

  const username = member.github_username;
  const activeBranches: typeof branches = username
    ? (() => {
        const matched = branches.filter(
          (b) =>
            b.authorLogin === username ||
            b.prAssignee === username ||
            b.prRequestedReviewer === username,
        );
        // Dedupe by (repo, name) — same branch can appear in multiple match buckets.
        const seen = new Set<string>();
        const unique: typeof matched = [];
        for (const b of matched) {
          const key = `${b.repo ?? ''}#${b.name}`;
          if (seen.has(key)) continue;
          seen.add(key);
          unique.push(b);
        }
        // Most recent commit first; branches without commit-date sink to the bottom.
        unique.sort((a, b) => (b.lastCommitDate ?? '').localeCompare(a.lastCommitDate ?? ''));
        return unique;
      })()
    : [];

  return { member, tasks, meetings, activeBranches, weekTargets, weekActuals, unprocessedInsights };
}
