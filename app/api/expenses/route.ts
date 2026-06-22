import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { insertExpense, listExpenses } from '@/lib/expense-store';
import { isExpenseScenario, validateCreateExpense } from '@/lib/expense-validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!requireApiAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const scenario = req.nextUrl.searchParams.get('scenario') ?? 'exist';
  if (!isExpenseScenario(scenario)) {
    return NextResponse.json({ error: "scenario must be 'exist' or 'pre-exist'" }, { status: 400 });
  }

  try {
    return NextResponse.json({ expenses: await listExpenses(scenario) });
  } catch (err) {
    console.error('[expenses] list failed:', err);
    return NextResponse.json({ error: 'Expenses konnten nicht geladen werden' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!requireApiAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const validated = validateCreateExpense(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  try {
    const result = await insertExpense(validated.value);
    if (!result.created) {
      return NextResponse.json({ created: false, status: 'duplicate_ignored' });
    }
    return NextResponse.json({ created: true, expense: result.expense });
  } catch (err) {
    console.error('[expenses] insert failed:', err);
    return NextResponse.json({ error: 'Expense konnte nicht gespeichert werden' }, { status: 500 });
  }
}
