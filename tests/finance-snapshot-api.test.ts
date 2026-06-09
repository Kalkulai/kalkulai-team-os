import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { FinanceData } from '@/types/finance';

const SECRET = 'unit-test-secret';
const insertFinanceSnapshotMock = vi.fn();

vi.mock('@/lib/finance-store', () => ({
  isFinanceScenario: (value: unknown) => value === 'exist' || value === 'current',
  insertFinanceSnapshot: (...args: unknown[]) => insertFinanceSnapshotMock(...args),
}));

import { POST } from '@/app/api/finance/snapshot/route';

function validFinanceData(): Omit<FinanceData, 'generated_at' | 'data_origin'> {
  return {
    as_of: 'Finanzplan June-August · 2026-06-01',
    currency: 'EUR',
    cash_on_hand_eur: 7333,
    runway_months: 5,
    break_even_label: 'M6 · Jan 2027',
    monthly_burn: { actual_eur: 1367, plan_eur: 2500, delta_eur: -1133 },
    cost_lines: [{ label: 'OpenAI/Azure', amount_eur: 1367, fixed: false, paid_by: 'Company' }],
    paid_by: [{ name: 'Company', value_eur: 1367 }],
    forecast_6m: [{ month: 'Jun', cash_eur: 5966, burn_eur: 1367 }],
    pilot_health: [{ name: '13 Piloten', status: 'green', note: 'aktiv' }],
  };
}

function request(data: Omit<FinanceData, 'generated_at' | 'data_origin'>): NextRequest {
  return new NextRequest('http://localhost/api/finance/snapshot', {
    method: 'POST',
    headers: new Headers({
      authorization: `Bearer ${SECRET}`,
      'content-type': 'application/json',
    }),
    body: JSON.stringify({ scenario: 'current', source: 'test', data }),
  });
}

beforeEach(() => {
  process.env.DASHBOARD_API_SECRET = SECRET;
  insertFinanceSnapshotMock.mockReset();
  insertFinanceSnapshotMock.mockResolvedValue('snapshot-1');
});

describe('POST /api/finance/snapshot — Konsistenz-Gate', () => {
  it('lehnt runway 18 bei cash 7333 / burn.actual 1367 mit 400 ab', async () => {
    const data = { ...validFinanceData(), runway_months: 18 };

    const res = await POST(request(data));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain('runway_months');
    expect(insertFinanceSnapshotMock).not.toHaveBeenCalled();
  });

  it('akzeptiert runway 5 bei cash 7333 / burn.actual 1367 mit 200', async () => {
    const res = await POST(request(validFinanceData()));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({ ok: true, id: 'snapshot-1', scenario: 'current' });
    expect(insertFinanceSnapshotMock).toHaveBeenCalledOnce();
    expect(insertFinanceSnapshotMock.mock.calls[0][1].data_origin).toBe('db');
  });
});
