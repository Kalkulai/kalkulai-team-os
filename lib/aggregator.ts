// lib/aggregator.ts
import type { TeamMember, DailyBriefing, KpiDaily } from '@/types';
import {
  getIssuesForUser,
  getBugsFixedThisWeek,
  getTasksCompletedThisWeek,
} from './linear';
import { getTodayEvents, countSalesCallsToday } from './calendar';
import { getActiveBranches, getCommitsThisWeek } from './github';
import { getCallsThisWeek } from './hubspot'; // unused after Plan-B Phase 2; kept for potential VoIP re-enable
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

  const results = await Promise.allSettled([
    member.linear_user_id ? getIssuesForUser(member.linear_user_id) : Promise.resolve([]),
    getTodayEvents(member),
    getActiveBranches(),
    getWeekTargets(member.id, weekStart),
    getTopUnprocessedInsights(2),
    member.role === 'sales' ? getSalesCallsThisWeek(member.id) : Promise.resolve(0),
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
  const branches = results[2].status === 'fulfilled' ? results[2].value : [];
  const weekTargets = results[3].status === 'fulfilled'
    ? results[3].value
    : { tasks_target: 5, calls_target: 0, bugs_target: 0 };
  const unprocessedInsights = results[4].status === 'fulfilled' ? results[4].value : [];
  const salesLogCalls = results[5].status === 'fulfilled' ? (results[5].value as number) : 0;
  const githubCommits = results[6].status === 'fulfilled' ? results[6].value : 0;
  const bugsFixed = results[7].status === 'fulfilled' ? results[7].value : 0;
  const tasksCompleted = results[8].status === 'fulfilled' ? results[8].value : 0;

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

  // Sales-log cold calls (own table, replaces HubSpot for handy-call workflow): in-memory
  weekActuals.calls_made += typeof salesLogCalls === 'number' ? salesLogCalls : 0;

  // GitHub commits: not persisted, added in-memory only
  weekActuals.commits_count += typeof githubCommits === 'number' ? githubCommits : 0;

  // Linear bugs fixed (Bug-label issues completed this week): in-memory only
  weekActuals.bugs_fixed += typeof bugsFixed === 'number' ? bugsFixed : 0;

  const activeBranch =
    branches.find((b) => b.authorLogin === member.github_username)?.name ?? null;

  return { member, tasks, meetings, activeBranch, weekTargets, weekActuals, unprocessedInsights };
}
