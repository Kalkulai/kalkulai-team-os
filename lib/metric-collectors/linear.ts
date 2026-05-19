import { recordMetric, METRIC_KEYS } from '@/lib/business-metrics';
import { getCompletedIssuesSince } from '@/lib/linear';
import { supabaseAdmin } from '@/lib/supabase';

interface MemberLite {
  id: string;
  linear_user_id: string | null;
}

/**
 * For each member: count bugs closed in the last 24h and persist as
 * (member, bugs_closed, today, count). Idempotent over (member,key,day).
 */
export async function collectLinearMetrics(): Promise<{ memberId: string; bugs_closed: number }[]> {
  const { data: members, error } = await supabaseAdmin
    .from('team_members')
    .select('id, linear_user_id')
    .not('linear_user_id', 'is', null);
  if (error) throw error;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const results: { memberId: string; bugs_closed: number }[] = [];

  for (const m of (members ?? []) as MemberLite[]) {
    if (!m.linear_user_id) continue;
    const completed = await getCompletedIssuesSince(m.linear_user_id, since);
    const bugIds: string[] = [];
    for (const issue of completed) {
      const labels = (issue as { labels?: string[] }).labels ?? [];
      if (labels.some((l) => /bug|fix/i.test(l))) {
        bugIds.push(issue.id);
      }
    }
    await recordMetric({
      memberId: m.id,
      metricKey: METRIC_KEYS.BUGS_CLOSED,
      value: bugIds.length,
      meta: { issueIds: bugIds, since },
    });
    results.push({ memberId: m.id, bugs_closed: bugIds.length });
  }
  return results;
}
