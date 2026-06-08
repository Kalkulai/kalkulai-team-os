import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { AUTH_COOKIE_NAME, signAuthCookie } from '@/lib/auth-cookie';

const listUserKpisMock = vi.fn();
const createKpiMock = vi.fn();

vi.mock('@/lib/kpis', () => ({
  listUserKpis: (...args: unknown[]) => listUserKpisMock(...args),
  createKpi: (...args: unknown[]) => createKpiMock(...args),
}));

vi.mock('@/lib/supabase', () => ({
  currentWeekStart: () => '2026-06-08',
}));

vi.mock('@/lib/backlog-access', () => ({
  defaultStepStatus: () => 'todo',
}));

import { GET, POST } from '@/app/api/kpis/route';

const AUTH_SECRET = 'test-auth-secret-with-enough-bytes';
const MEMBER_ID = '24d43f6d-4a7e-458b-a119-84ecb8e6616f';

function request(url: string, init: ConstructorParameters<typeof NextRequest>[1] = {}): NextRequest {
  return new NextRequest(url, init);
}

async function memberCookieHeader(): Promise<string> {
  const cookie = await signAuthCookie(undefined, Math.floor(Date.now() / 1000), MEMBER_ID);
  return `${AUTH_COOKIE_NAME}=${cookie}`;
}

describe('/api/kpis member auth', () => {
  beforeEach(() => {
    process.env.TEAM_OS_AUTH_SECRET = AUTH_SECRET;
    delete process.env.DASHBOARD_API_SECRET;
    listUserKpisMock.mockReset();
    createKpiMock.mockReset();
    listUserKpisMock.mockResolvedValue([]);
    createKpiMock.mockResolvedValue({ id: 'kpi-1', user_id: MEMBER_ID, name: 'Sales Calls' });
  });

  afterEach(() => {
    delete process.env.TEAM_OS_AUTH_SECRET;
    delete process.env.DASHBOARD_API_SECRET;
  });

  it('allows signed member sessions to read KPIs without a bearer token', async () => {
    const res = await GET(request(`http://localhost/api/kpis?userId=${MEMBER_ID}`, {
      headers: { cookie: await memberCookieHeader() },
    }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual([]);
    expect(listUserKpisMock).toHaveBeenCalledWith(MEMBER_ID, '2026-06-08');
  });

  it('allows signed member sessions to create KPIs without a bearer token', async () => {
    const res = await POST(request('http://localhost/api/kpis', {
      method: 'POST',
      headers: {
        cookie: await memberCookieHeader(),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        user_id: MEMBER_ID,
        type: 'counter',
        name: 'Sales Calls',
        unit: 'Anrufe',
        target: 30,
      }),
    }));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json).toEqual({ id: 'kpi-1', user_id: MEMBER_ID, name: 'Sales Calls' });
    expect(createKpiMock).toHaveBeenCalledWith(expect.objectContaining({
      user_id: MEMBER_ID,
      type: 'counter',
      name: 'Sales Calls',
      unit: 'Anrufe',
      target: 30,
      week_start: '2026-06-08',
    }));
  });
});
