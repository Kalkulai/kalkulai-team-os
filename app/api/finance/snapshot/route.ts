import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { insertFinanceSnapshot, isFinanceScenario } from '@/lib/finance-store';
import type { CostLine, FinanceData, ForecastPoint, PaidBySlice, PilotHealthRow } from '@/types/finance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AMPEL = new Set(['green', 'yellow', 'red']);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
function isStr(v: unknown): v is string {
  return typeof v === 'string';
}

function isCostLine(v: unknown): v is CostLine {
  return (
    isRecord(v) &&
    isStr(v.label) &&
    isNum(v.amount_eur) &&
    typeof v.fixed === 'boolean' &&
    isStr(v.paid_by) &&
    (v.note === undefined || isStr(v.note))
  );
}
function isPaidBy(v: unknown): v is PaidBySlice {
  return isRecord(v) && isStr(v.name) && isNum(v.value_eur);
}
function isForecast(v: unknown): v is ForecastPoint {
  return isRecord(v) && isStr(v.month) && isNum(v.cash_eur) && isNum(v.burn_eur);
}
function isPilot(v: unknown): v is PilotHealthRow {
  return isRecord(v) && isStr(v.name) && isStr(v.note) && AMPEL.has(v.status as string);
}

/** Boundary validation: never trust external payloads. */
function validateFinanceData(v: unknown): { ok: true; value: FinanceData } | { ok: false; error: string } {
  if (!isRecord(v)) return { ok: false, error: 'data must be an object' };
  if (v.currency !== 'EUR') return { ok: false, error: "currency must be 'EUR'" };
  if (!isStr(v.as_of)) return { ok: false, error: 'as_of must be a string' };
  if (!isNum(v.cash_on_hand_eur)) return { ok: false, error: 'cash_on_hand_eur must be a number' };
  if (!isNum(v.runway_months)) return { ok: false, error: 'runway_months must be a number' };
  if (!isStr(v.break_even_label)) return { ok: false, error: 'break_even_label must be a string' };
  const mb = v.monthly_burn;
  if (!isRecord(mb) || !isNum(mb.actual_eur) || !isNum(mb.plan_eur) || !isNum(mb.delta_eur)) {
    return { ok: false, error: 'monthly_burn must have numeric actual_eur/plan_eur/delta_eur' };
  }
  if (!Array.isArray(v.cost_lines) || !v.cost_lines.every(isCostLine)) {
    return { ok: false, error: 'cost_lines must be CostLine[]' };
  }
  if (!Array.isArray(v.paid_by) || !v.paid_by.every(isPaidBy)) {
    return { ok: false, error: 'paid_by must be PaidBySlice[]' };
  }
  if (!Array.isArray(v.forecast_6m) || !v.forecast_6m.every(isForecast)) {
    return { ok: false, error: 'forecast_6m must be ForecastPoint[]' };
  }
  if (!Array.isArray(v.pilot_health) || !v.pilot_health.every(isPilot)) {
    return { ok: false, error: 'pilot_health must be PilotHealthRow[]' };
  }
  // generated_at is stamped server-side regardless of input.
  return { ok: true, value: { ...(v as unknown as FinanceData), generated_at: new Date().toISOString() } };
}

export async function POST(req: NextRequest) {
  if (!requireApiAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!isRecord(body)) {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 });
  }

  const scenario = body.scenario;
  if (!isFinanceScenario(scenario)) {
    return NextResponse.json({ error: "scenario must be 'exist' or 'current'" }, { status: 400 });
  }

  const validated = validateFinanceData(body.data);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const source = isStr(body.source) ? body.source : undefined;

  try {
    const id = await insertFinanceSnapshot(scenario, validated.value, source);
    return NextResponse.json({ ok: true, id, scenario });
  } catch (err) {
    console.error('[finance] snapshot insert failed:', err);
    return NextResponse.json(
      { error: 'Snapshot konnte nicht gespeichert werden' },
      { status: 500 },
    );
  }
}
