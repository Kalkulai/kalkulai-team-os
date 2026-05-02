// lib/aggregator.ts
import type { TeamMember, DailyBriefing } from '@/types';
import { getIssuesForUser } from './linear';
import { getTodayEvents, countSalesCallsToday } from './calendar';
import { getActiveBranches, getCommitsThisWeek } from './github';
import { getCallsThisWeek } from './hubspot';
import { countUnprocessedInsights } from './notion';
import { getWeekTargets, getWeekActuals, supabaseAdmin, currentWeekStart } from './supabase';
import { format } from 'date-fns';

export async function buildDailyBriefing(member: TeamMember): Promise<DailyBriefing> {
  const weekStart = currentWeekStart();
  const today = format(new Date(), 'yyyy-MM-dd');

  const [tasks, meetings, branches, weekTargets, weekActuals, unprocessedInsights] =
    await Promise.all([
      member.linear_user_id ? getIssuesForUser(member.linear_user_id) : Promise.resolve([]),
      member.google_calendar_id ? getTodayEvents(member.google_calendar_id) : Promise.resolve([]),
      getActiveBranches(),
      getWeekTargets(member.id, weekStart),
      getWeekActuals(member.id, weekStart),
      countUnprocessedInsights(),
    ]);

  // Sync: Sales-Calls aus Kalender in kpi_daily schreiben
  if (member.role === 'sales' && member.google_calendar_id) {
    const salesCallsToday = countSalesCallsToday(meetings);
    if (salesCallsToday > 0) {
      await supabaseAdmin.from('kpi_daily').upsert({
        user_id: member.id,
        date: today,
        calls_made: salesCallsToday,
      });
      weekActuals.calls_made += salesCallsToday;
    }
  }

  // Sync: HubSpot Cold-Calls für Sales addieren
  if (member.role === 'sales' && member.hubspot_owner_id) {
    const hubspotCalls = await getCallsThisWeek(member.hubspot_owner_id);
    weekActuals.calls_made += hubspotCalls.length;
  }

  // Sync: GitHub-Commits für Dev
  if (member.role === 'dev' && member.github_username) {
    const commits = await getCommitsThisWeek(member.github_username);
    weekActuals.commits_count += commits;
  }

  const activeBranch =
    branches.find((b) => b.authorLogin === member.github_username)?.name ?? null;

  return { member, tasks, meetings, activeBranch, weekTargets, weekActuals, unprocessedInsights };
}
