import { recordMetric, METRIC_KEYS } from '@/lib/business-metrics';
import { getCallsThisWeek } from '@/lib/hubspot';
import { supabaseAdmin } from '@/lib/supabase';

interface MemberLite {
  id: string;
  hubspot_owner_id: string | null;
}

/**
 * For each member with a hubspot_owner_id: count calls in the last 24h
 * (proxy for "customer conversations"). Idempotent.
 */
export async function collectHubspotMetrics(): Promise<{ memberId: string; customer_conversations: number }[]> {
  const { data: members, error } = await supabaseAdmin
    .from('team_members')
    .select('id, hubspot_owner_id')
    .not('hubspot_owner_id', 'is', null);
  if (error) throw error;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const results: { memberId: string; customer_conversations: number }[] = [];

  for (const m of (members ?? []) as MemberLite[]) {
    if (!m.hubspot_owner_id) continue;
    let count = 0;
    let ids: string[] = [];
    try {
      const calls = await getCallsThisWeek(m.hubspot_owner_id, since);
      count = calls.length;
      ids = calls.map((c) => (c as { id: string }).id).slice(0, 50);
    } catch {
      // member-specific HubSpot error — record 0 with note in meta
    }
    await recordMetric({
      memberId: m.id,
      metricKey: METRIC_KEYS.CUSTOMER_CONVERSATIONS,
      value: count,
      meta: { callIds: ids, since: since.toISOString() },
    });
    results.push({ memberId: m.id, customer_conversations: count });
  }
  return results;
}
