import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { buildFinanceData } from '@/lib/finance-data';
import { activeScenario } from '@/lib/finance-sync';
import {
  getLatestFinanceSnapshot,
  isFinanceScenario,
} from '@/lib/finance-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Live feed: returns the most recent snapshot Hermes posted. Ohne ?scenario
// greift das aktive Szenario (ACTIVE_FINANCE_SCENARIO oder Datums-Switch),
// damit das Dashboard nicht still auf ein fremdes Szenario kippt. Ein expliziter
// ?scenario-Param ueberschreibt das. Falls noch gar kein Snapshot existiert /
// DB unreachable: Fallback auf die Code-Defaults in lib/finance-data.ts.
export async function GET(req: NextRequest) {
  if (!requireApiAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const param = req.nextUrl.searchParams.get('scenario');
  const scenario = isFinanceScenario(param) ? param : activeScenario();

  try {
    const snapshot = await getLatestFinanceSnapshot(scenario);
    if (snapshot) return NextResponse.json({ ...snapshot, data_origin: 'db' });
  } catch (err) {
    console.warn(
      '[finance] snapshot read failed, serving defaults:',
      err instanceof Error ? err.message : err,
    );
  }

  console.info('[finance] no snapshot for scenario %s — serving defaults', scenario);
  return NextResponse.json(buildFinanceData());
}
