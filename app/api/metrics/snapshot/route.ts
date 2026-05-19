import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { collectLinearMetrics } from '@/lib/metric-collectors/linear';
import { collectGithubMetrics } from '@/lib/metric-collectors/github';
import { collectHubspotMetrics } from '@/lib/metric-collectors/hubspot';
import { syncWeeklyHealthReport } from '@/lib/vault-sync';

export const runtime = 'nodejs';
export const maxDuration = 200;

/**
 * Snapshot-Cron: invoked daily (~23:30 UTC) by a systemd-timer on agents-01.
 * Collects metrics from each upstream source and upserts into business_metrics,
 * then mirrors the week's aggregates into the vault so Hermes can read them.
 * Idempotent — running twice the same day overwrites the day's row + rewrites
 * the week's vault file.
 */
export async function POST(req: NextRequest) {
  if (!requireApiAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const results: Record<string, unknown> = {};
  const errors: string[] = [];

  for (const [name, fn] of [
    ['linear',  collectLinearMetrics],
    ['github',  collectGithubMetrics],
    ['hubspot', collectHubspotMetrics],
  ] as const) {
    try {
      results[name] = await fn();
    } catch (err) {
      errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Mirror the week's aggregates into the Hermes vault.
  try {
    results.vault = await syncWeeklyHealthReport();
  } catch (err) {
    errors.push(`vault: ${err instanceof Error ? err.message : String(err)}`);
  }

  return NextResponse.json({ ok: errors.length === 0, results, errors });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
