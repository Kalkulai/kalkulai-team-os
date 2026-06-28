import { beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/finance/planning/route';

const SECRET = 'unit-test-secret';

// Isolate other bearer vars that would pass auth and mask 401 tests
const OTHER_BEARER_VARS = [
  'HERMES_DASHBOARD_TOKEN',
  'CRON_DASHBOARD_TOKEN',
  'OPS_DASHBOARD_TOKEN',
  'CRON_SECRET',
];

function makeRequest(token?: string): NextRequest {
  return new NextRequest('http://localhost/api/finance/planning', {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

beforeEach(() => {
  process.env.DASHBOARD_API_SECRET = SECRET;
  for (const v of OTHER_BEARER_VARS) delete process.env[v];
});

describe('GET /api/finance/planning', () => {
  it('gibt 401 ohne Token', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('gibt 401 mit falschem Token', async () => {
    const res = await GET(makeRequest('wrong-secret'));
    expect(res.status).toBe(401);
  });

  it('gibt 200 mit PlanningData-Shape', async () => {
    const res = await GET(makeRequest(SECRET));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('items');
    expect(Array.isArray(body.items)).toBe(true);
    expect(body).toHaveProperty('funding_start', '2026-08');
    expect(body).toHaveProperty('funding_end', '2027-07');
  });

  it('alle Items haben Pflichtfelder', async () => {
    const res = await GET(makeRequest(SECRET));
    const body = await res.json();
    for (const item of body.items) {
      expect(typeof item.id).toBe('string');
      expect(['sachmittel', 'coaching']).toContain(item.category);
      expect(typeof item.start).toBe('string');
      expect(typeof item.end).toBe('string');
      expect(typeof item.amount_eur_total).toBe('number');
    }
  });

  it('Sachmittel-Summe ergibt 30.000 €', async () => {
    const res = await GET(makeRequest(SECRET));
    const body = await res.json();
    const total = body.items
      .filter((i: { category: string }) => i.category === 'sachmittel')
      .reduce((sum: number, i: { amount_eur_total: number }) => sum + i.amount_eur_total, 0);
    expect(total).toBe(30_000);
  });

  it('Coaching-Summe ergibt 5.000 €', async () => {
    const res = await GET(makeRequest(SECRET));
    const body = await res.json();
    const total = body.items
      .filter((i: { category: string }) => i.category === 'coaching')
      .reduce((sum: number, i: { amount_eur_total: number }) => sum + i.amount_eur_total, 0);
    expect(total).toBe(5_000);
  });
});
