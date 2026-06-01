import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { buildFinanceData } from '@/lib/finance-data';
import {
  getLatestFinanceSnapshot,
  getLatestFinanceSnapshotAny,
  isFinanceScenario,
} from '@/lib/finance-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Live feed: returns the most recent snapshot Hermes posted (any scenario by
// default, or a specific one via ?scenario=). Falls back to the code defaults
// in lib/finance-data.ts only as a bootstrap (no snapshot yet / DB unreachable).
export async function GET(req: NextRequest) {
  if (!requireApiAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const param = req.nextUrl.searchParams.get('scenario');
  const scenario = isFinanceScenario(param) ? param : null;

  try {
    const snapshot = scenario
      ? await getLatestFinanceSnapshot(scenario)
      : await getLatestFinanceSnapshotAny();
    if (snapshot) return NextResponse.json(snapshot);
  } catch (err) {
    console.warn(
      '[finance] snapshot read failed, serving defaults:',
      err instanceof Error ? err.message : err,
    );
  }

  return NextResponse.json(buildFinanceData());
}
