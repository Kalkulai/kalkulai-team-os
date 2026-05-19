import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { collectLinearMetrics } from '@/lib/metric-collectors/linear';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Snapshot-Cron: invoked daily (~23:30 UTC) by a systemd-timer on agents-01.
 * Collects metrics from each upstream source and upserts into business_metrics.
 * Idempotent — running twice the same day overwrites the day's row.
 */
export async function POST(req: NextRequest) {
  if (!requireApiAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const results: Record<string, unknown> = {};
  const errors: string[] = [];

  try {
    results.linear = await collectLinearMetrics();
  } catch (err) {
    errors.push(`linear: ${err instanceof Error ? err.message : String(err)}`);
  }

  // future collectors: github, vercel, hubspot, calendar, vault.

  return NextResponse.json({ ok: errors.length === 0, results, errors });
}

export async function GET(req: NextRequest) {
  // Convenience GET so a cron / curl can fire it without crafting POST.
  return POST(req);
}
