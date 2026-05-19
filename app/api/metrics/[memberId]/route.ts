import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import {
  METRIC_KEYS,
  getDailySparkline,
  getWeekAggregates,
  getMonthAggregates,
  currentWeekIsoStart,
  currentMonthStart,
} from '@/lib/business-metrics';

const ALL_KEYS = Object.values(METRIC_KEYS);

export const runtime = 'nodejs';

function prevWeekStart(weekStart: string): string {
  const d = new Date(weekStart + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ memberId: string }> },
) {
  if (!requireApiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { memberId } = await params;
  const range = req.nextUrl.searchParams.get('range') ?? 'week';

  const [weekNow, weekPrev, monthNow] = await Promise.all([
    getWeekAggregates(memberId, ALL_KEYS, currentWeekIsoStart()),
    getWeekAggregates(memberId, ALL_KEYS, prevWeekStart(currentWeekIsoStart())),
    getMonthAggregates(memberId, ALL_KEYS, currentMonthStart()),
  ]);

  const sparklines: Record<string, Array<{ day: string; value: number }>> = {};
  for (const key of ALL_KEYS) {
    sparklines[key] = await getDailySparkline(memberId, key, 14);
  }

  return NextResponse.json({
    memberId,
    range,
    week_start_now: currentWeekIsoStart(),
    week_start_prev: prevWeekStart(currentWeekIsoStart()),
    month_start: currentMonthStart(),
    week_now: weekNow,
    week_prev: weekPrev,
    month: monthNow,
    sparklines,
  });
}
