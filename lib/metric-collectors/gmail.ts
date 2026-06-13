import { recordMetric, METRIC_KEYS, todayDay } from '@/lib/business-metrics';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * GTM/outreach collector. Does NOT touch Gmail directly (no creds in the app).
 * Instead it derives outreach metrics from campaign_events already in the DB:
 * counts the day's 'sent' / 'replied' / 'meeting_booked' events per campaign
 * owner and upserts business_metrics for that member.
 *
 * Leon's Innung-Outreach lands here because campaign_events carry
 * external_system 'gmail' and the campaign's owner_member_id is Leon. The
 * collector is owner-generic so Paul/Felix outreach is tracked the same way.
 * Idempotent — re-running the same day overwrites the day's rows.
 */

interface CampaignOwnerRow {
  id: string;
  owner_member_id: string | null;
}

interface CampaignEventRow {
  campaign_id: string;
  event_type: string;
}

const EVENT_TO_METRIC: Record<string, string> = {
  sent: METRIC_KEYS.MAILS_SENT,
  replied: METRIC_KEYS.REPLIES_RECEIVED,
  meeting_booked: METRIC_KEYS.MEETINGS_BOOKED,
};

export interface GmailMetricSummary {
  memberId: string;
  mails_sent: number;
  replies_received: number;
  meetings_booked: number;
}

export async function collectGmailMetrics(): Promise<GmailMetricSummary[]> {
  const day = todayDay();
  const dayStart = `${day}T00:00:00.000Z`;
  const dayEnd = `${day}T23:59:59.999Z`;

  const { data: campaigns, error: campaignErr } = await supabaseAdmin
    .from('campaigns')
    .select('id, owner_member_id')
    .not('owner_member_id', 'is', null);
  if (campaignErr) throw campaignErr;

  const ownerByCampaign = new Map<string, string>();
  for (const c of (campaigns ?? []) as CampaignOwnerRow[]) {
    if (c.owner_member_id) ownerByCampaign.set(c.id, c.owner_member_id);
  }
  if (ownerByCampaign.size === 0) return [];

  const { data: events, error: eventErr } = await supabaseAdmin
    .from('campaign_events')
    .select('campaign_id, event_type')
    .in('event_type', Object.keys(EVENT_TO_METRIC))
    .gte('occurred_at', dayStart)
    .lte('occurred_at', dayEnd);
  if (eventErr) throw eventErr;

  // member -> metric_key -> count, seeded to 0 so days with no activity still
  // record a 0 (keeps sparklines dense and resets a prior over-count on re-run).
  const counts = new Map<string, Record<string, number>>();
  for (const memberId of new Set(ownerByCampaign.values())) {
    counts.set(memberId, {
      [METRIC_KEYS.MAILS_SENT]: 0,
      [METRIC_KEYS.REPLIES_RECEIVED]: 0,
      [METRIC_KEYS.MEETINGS_BOOKED]: 0,
    });
  }

  for (const e of (events ?? []) as CampaignEventRow[]) {
    const memberId = ownerByCampaign.get(e.campaign_id);
    if (!memberId) continue;
    const metricKey = EVENT_TO_METRIC[e.event_type];
    if (!metricKey) continue;
    const bucket = counts.get(memberId);
    if (!bucket) continue;
    bucket[metricKey] += 1;
  }

  const results: GmailMetricSummary[] = [];
  for (const [memberId, bucket] of counts) {
    for (const metricKey of Object.values(EVENT_TO_METRIC)) {
      await recordMetric({
        memberId,
        metricKey,
        day,
        value: bucket[metricKey],
        meta: { source: 'campaign_events', day },
      });
    }
    results.push({
      memberId,
      mails_sent: bucket[METRIC_KEYS.MAILS_SENT],
      replies_received: bucket[METRIC_KEYS.REPLIES_RECEIVED],
      meetings_booked: bucket[METRIC_KEYS.MEETINGS_BOOKED],
    });
  }
  return results;
}
