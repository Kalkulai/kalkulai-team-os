import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { aggregateExist } from '@/lib/exist-aggregate';
import { getExistBudget } from '@/lib/exist-budget';
import { listExpenses } from '@/lib/expense-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!requireApiAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const expenses = await listExpenses('exist');
    return NextResponse.json(aggregateExist(expenses, getExistBudget(), new Date()));
  } catch (err) {
    console.error('[finance/exist] aggregate failed:', err);
    return NextResponse.json({ error: 'EXIST-Finance konnte nicht geladen werden' }, { status: 500 });
  }
}
