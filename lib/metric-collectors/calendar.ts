import { recordMetric, METRIC_KEYS } from '@/lib/business-metrics';
import { getTodayEvents } from '@/lib/calendar';
import { supabaseAdmin } from '@/lib/supabase';
import type { TeamMember } from '@/types';

const DEEP_WORK_TAG = /\[focus\]|\[deep\]|deep[\s-]?work/i;
const CUSTOMER_TAG = /demo|kunde|customer|call|paul|sales/i;

/**
 * For each member with a google_refresh_token: count today's calendar
 * events tagged as deep-work blocks (title contains [focus]/[deep])
 * and customer-conversations (title contains demo/kunde/...).
 */
export async function collectCalendarMetrics(): Promise<Array<{ memberId: string; deep_work: number; conversations: number }>> {
  const { data: members, error } = await supabaseAdmin
    .from('team_members')
    .select('*')
    .not('google_refresh_token', 'is', null);
  if (error) throw error;

  const results: Array<{ memberId: string; deep_work: number; conversations: number }> = [];

  for (const m of (members ?? []) as TeamMember[]) {
    let deep = 0;
    let conv = 0;
    try {
      const events = await getTodayEvents(m);
      for (const e of events) {
        const title = ((e as { summary?: string }).summary ?? '').toString();
        if (DEEP_WORK_TAG.test(title)) deep += 1;
        if (CUSTOMER_TAG.test(title)) conv += 1;
      }
    } catch {
      // member-specific calendar failure — record 0
    }
    await recordMetric({
      memberId: m.id,
      metricKey: METRIC_KEYS.DEEP_WORK_BLOCKS,
      value: deep,
      meta: { source: 'calendar' },
    });
    results.push({ memberId: m.id, deep_work: deep, conversations: conv });
  }
  return results;
}
