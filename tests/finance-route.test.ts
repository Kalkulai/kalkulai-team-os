import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { FinanceData } from '@/types/finance';

const SECRET = 'unit-test-secret';
const getLatestFinanceSnapshotMock = vi.fn();

vi.mock('@/lib/finance-store', () => ({
  isFinanceScenario: (value: unknown) => value === 'exist' || value === 'current',
  getLatestFinanceSnapshot: (...args: unknown[]) => getLatestFinanceSnapshotMock(...args),
}));

vi.mock('@/lib/finance-sync', () => ({
  activeScenario: () => 'current',
}));

import { GET } from '@/app/api/finance/route';

// Alle weiteren Bearer-Token aus auth-context.ts:TOKEN_ACTORS isolieren — sonst
// authentifiziert ein real gesetzter Token den 401-Test fälschlich durch.
const OTHER_BEARER_VARS = [
  'HERMES_DASHBOARD_TOKEN',
  'CRON_DASHBOARD_TOKEN',
  'OPS_DASHBOARD_TOKEN',
  'CRON_SECRET',
];

function request(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/finance', {
    method: 'GET',
    headers: new Headers(headers),
  });
}

function authed(): NextRequest {
  return request({ authorization: `Bearer ${SECRET}` });
}

beforeEach(() => {
  process.env.DASHBOARD_API_SECRET = SECRET;
  for (const v of OTHER_BEARER_VARS) delete process.env[v];
  getLatestFinanceSnapshotMock.mockReset();
});

describe('GET /api/finance — Auth', () => {
  it('lehnt fehlenden Bearer mit 401 ab', async () => {
    const res = await GET(request());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('lehnt falschen Bearer mit 401 ab', async () => {
    const res = await GET(request({ authorization: 'Bearer wrong' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });
});

describe('GET /api/finance — data_origin', () => {
  it('stempelt DB-Snapshots als "db" (Spread-Override über Legacy-Rows)', async () => {
    // Legacy-Snapshot mit falschem data_origin in data → Route muss per Spread auf 'db' überschreiben.
    const legacy = {
      generated_at: '2026-06-01T00:00:00.000Z',
      data_origin: 'defaults',
      as_of: 'Snapshot',
      currency: 'EUR',
      cash_on_hand_eur: 7333,
      runway_months: 5,
      break_even_label: 'M6 · Jan 2027',
      monthly_burn: { actual_eur: 1367, plan_eur: 2500, delta_eur: -1133 },
      cost_lines: [{ label: 'OpenAI', amount_eur: 1367, fixed: false, paid_by: 'Company' }],
      paid_by: [{ name: 'Company', value_eur: 1367 }],
      forecast_6m: [{ month: 'Jun', cash_eur: 5966, burn_eur: 1367 }],
      pilot_health: [{ name: '13 Piloten', status: 'green', note: 'aktiv' }],
    } as unknown as FinanceData;
    getLatestFinanceSnapshotMock.mockResolvedValue(legacy);

    const res = await GET(authed());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data_origin).toBe('db');
    expect(json.as_of).toBe('Snapshot');
    expect(json.currency).toBe('EUR');
  });

  it('liefert Code-Defaults mit "defaults" wenn kein Snapshot existiert', async () => {
    getLatestFinanceSnapshotMock.mockResolvedValue(null);
    const res = await GET(authed());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data_origin).toBe('defaults');
    expect(json.currency).toBe('EUR');
  });

  it('fällt auf Defaults zurück wenn der DB-Read wirft', async () => {
    getLatestFinanceSnapshotMock.mockRejectedValue(new Error('db down'));
    const res = await GET(authed());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data_origin).toBe('defaults');
  });
});
