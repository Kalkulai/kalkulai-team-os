import { describe, it, expect, vi, beforeEach } from 'vitest';

const insertMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      insert: insertMock,
    })),
  },
  getSalesCallsThisWeek: vi.fn(),
}));

import { POST } from '@/app/api/sales/log-call/route';
import { getSalesCallsThisWeek } from '@/lib/supabase';

const SECRET = 'unit-test-secret';
const URL = 'http://localhost/api/sales/log-call';

function makeRequest(body: unknown, auth: string | null = `Bearer ${SECRET}`): Request {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (auth !== null) headers.set('authorization', auth);
  return new Request(URL, { method: 'POST', headers, body: JSON.stringify(body) });
}

describe('POST /api/sales/log-call', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DASHBOARD_API_SECRET = SECRET;
    insertMock.mockResolvedValue({
      data: [{ id: 'log-1', user_id: 'mem-1', type: 'cold-call', logged_at: '2026-05-04T10:00:00Z' }],
      error: null,
    });
  });

  it('rejects requests without a valid Bearer token', async () => {
    const res = await POST(makeRequest({ userId: 'mem-1', type: 'cold-call' }, null));
    expect(res.status).toBe(401);
  });

  it('rejects when userId is missing', async () => {
    const res = await POST(makeRequest({ type: 'cold-call' }));
    expect(res.status).toBe(400);
  });

  it('rejects an unsupported type', async () => {
    const res = await POST(makeRequest({ userId: 'mem-1', type: 'breakfast' }));
    expect(res.status).toBe(400);
  });

  it('inserts a cold-call log and returns 201', async () => {
    const res = await POST(makeRequest({ userId: 'mem-1', type: 'cold-call' }));
    expect(res.status).toBe(201);
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'mem-1', type: 'cold-call' })
    );
  });

  it('passes through optional note', async () => {
    await POST(makeRequest({ userId: 'mem-1', type: 'demo', note: 'great call' }));
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'mem-1', type: 'demo', note: 'great call' })
    );
  });

  it('returns 500 when the DB insert fails', async () => {
    insertMock.mockResolvedValueOnce({ data: null, error: { message: 'db down' } });
    const res = await POST(makeRequest({ userId: 'mem-1', type: 'cold-call' }));
    expect(res.status).toBe(500);
  });
});

describe('getSalesCallsThisWeek (mocked)', () => {
  it('is exported from supabase helper', () => {
    expect(getSalesCallsThisWeek).toBeDefined();
  });
});
