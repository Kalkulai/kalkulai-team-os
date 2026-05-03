// lib/aggregator.ts
import type { TeamMember, DailyBriefing, KpiDaily } from '@/types';
import { getIssuesForUser, getBugsFixedThisWeek } from './linear';
import { getTodayEvents, countSalesCallsToday } from './calendar';
import { getActiveBranches, getCommitsThisWeek } from './github';
import { getCallsThisWeek } from './hubspot';
import { countUnprocessedInsights } from './notion';
import { getWeekTargets, getWeekActuals, supabaseAdmin, currentWeekStart } from './supabase';
import { format } from 'date-fns';

export async function buildDailyBriefing(member: TeamMember): Promise<DailyBriefing> {
  const weekStart = currentWeekStart();
  const today = format(new Date(), 'yyyy-MM-dd');

  const results = await Promise.allSettled([
    member.linear_user_id ? getIssuesForUser(member.linear_user_id) : Promise.resolve([]),
    member.google_calendar_id ? getTodayEvents(member.google_calendar_id) : Promise.resolve([]),
    getActiveBranches(),
    getWeekTargets(member.id, weekStart),
    countUnprocessedInsights(),
    member.role === 'sales' && member.hubspot_owner_id
      ? getCallsThisWeek(member.hubspot_owner_id)
      : Promise.resolve([]),
    member.role === 'dev' && member.github_username
      ? getCommitsThisWeek(member.github_username)
      : Promise.resolve(0),
    member.role === 'dev' && member.linear_user_id
      ? getBugsFixedThisWeek(member.linear_user_id)
      : Promise.resolve(0),
  ]);

  const tasks = results[0].status === 'fulfilled' ? results[0].value : [];
  const meetings = results[1].status === 'fulfilled' ? results[1].value : [];
  const branches = results[2].status === 'fulfilled' ? results[2].value : [];
  const weekTargets = results[3].status === 'fulfilled'
    ? results[3].value
    : { tasks_target: 5, calls_target: 0, bugs_target: 0 };
  const unprocessedInsights = results[4].status === 'fulfilled' ? results[4].value : 0;
  const hubspotCalls = results[5].status === 'fulfilled' ? results[5].value : [];
  const githubCommits = results[6].status === 'fulfilled' ? results[6].value : 0;
  const bugsFixed = results[7].status === 'fulfilled' ? results[7].value : 0;

  // Sync: Sales-Calls aus Kalender in kpi_daily persistieren
  if (member.role === 'sales' && member.google_calendar_id) {
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

  // HubSpot cold calls: not persisted, added in-memory only
  weekActuals.calls_made += hubspotCalls.length;

  // GitHub commits: not persisted, added in-memory only
  weekActuals.commits_count += typeof githubCommits === 'number' ? githubCommits : 0;

  // Linear bugs fixed (Bug-label issues completed this week): in-memory only
  weekActuals.bugs_fixed += typeof bugsFixed === 'number' ? bugsFixed : 0;

  const activeBranch =
    branches.find((b) => b.authorLogin === member.github_username)?.name ?? null;

  return { member, tasks, meetings, activeBranch, weekTargets, weekActuals, unprocessedInsights };
}
