import { createClient } from '@supabase/supabase-js';
import { format, startOfWeek } from 'date-fns';
import type { TeamMember, KpiTargets, KpiDaily } from '@/types';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabase = createClient(url, anon);
export const supabaseAdmin = createClient(url, service);

export async function getAllMembers(): Promise<TeamMember[]> {
  const { data, error } = await supabaseAdmin.from('team_members').select('*');
  if (error) throw error;
  return data;
}

export async function getWeekTargets(userId: string, weekStart: string): Promise<KpiTargets> {
  const { data } = await supabaseAdmin
    .from('kpi_targets')
    .select('tasks_target, calls_target, bugs_target')
    .eq('user_id', userId)
    .eq('week_start', weekStart)
    .single();
  return data ?? { tasks_target: 5, calls_target: 0, bugs_target: 0 };
}

export async function getWeekActuals(userId: string, weekStart: string): Promise<KpiDaily> {
  const { data } = await supabaseAdmin
    .from('kpi_daily')
    .select('tasks_completed, calls_made, bugs_fixed, commits_count')
    .eq('user_id', userId)
    .gte('date', weekStart);

  if (!data?.length) return { tasks_completed: 0, calls_made: 0, bugs_fixed: 0, commits_count: 0 };

  return data.reduce(
    (acc, row) => ({
      tasks_completed: acc.tasks_completed + row.tasks_completed,
      calls_made: acc.calls_made + row.calls_made,
      bugs_fixed: acc.bugs_fixed + row.bugs_fixed,
      commits_count: acc.commits_count + row.commits_count,
    }),
    { tasks_completed: 0, calls_made: 0, bugs_fixed: 0, commits_count: 0 }
  );
}

export async function upsertKpiTargets(
  userId: string,
  weekStart: string,
  targets: KpiTargets
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('kpi_targets')
    .upsert({ user_id: userId, week_start: weekStart, ...targets });
  if (error) throw error;
}

export function currentWeekStart(): string {
  return format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
}

export async function getSalesCallsThisWeek(userId: string): Promise<number> {
  const since = startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString();
  const { count, error } = await supabaseAdmin
    .from('sales_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('type', 'cold-call')
    .gte('logged_at', since);
  if (error) throw error;
  return count ?? 0;
}

export async function getSalesLogsTodayByType(userId: string): Promise<Record<string, number>> {
  const today = format(new Date(), 'yyyy-MM-dd');
  const { data, error } = await supabaseAdmin
    .from('sales_logs')
    .select('type')
    .eq('user_id', userId)
    .gte('logged_at', `${today}T00:00:00.000Z`)
    .lt('logged_at', `${today}T23:59:59.999Z`);
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.type] = (counts[row.type] ?? 0) + 1;
  }
  return counts;
}
