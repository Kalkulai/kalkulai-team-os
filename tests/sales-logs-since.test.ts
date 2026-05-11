import { describe, it, expect, vi, beforeEach } from 'vitest';

interface MockChain {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  gte: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
}

const mockChain: MockChain = {
  select: vi.fn(),
  eq: vi.fn(),
  gte: vi.fn(),
  order: vi.fn(),
};

const fromMock = vi.fn(() => mockChain);

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: fromMock }),
}));

import { getSalesLogsSince, type SalesLog } from '@/lib/supabase';

const USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef0123456789';
const SINCE = '2026-05-04T00:00:00.000Z';

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';

  mockChain.select.mockReset().mockReturnValue(mockChain);
  mockChain.eq.mockReset().mockReturnValue(mockChain);
  mockChain.gte.mockReset().mockReturnValue(mockChain);
  mockChain.order.mockReset();
  fromMock.mockClear();
});

describe('getSalesLogsSince', () => {
  it('returns rows from supabase', async () => {
    const rows: SalesLog[] = [
      { user_id: USER_ID, type: 'cold-call', logged_at: '2026-05-11T14:32:11.000Z' },
      { user_id: USER_ID, type: 'demo', logged_at: '2026-05-10T09:15:00.000Z' },
    ];
    mockChain.order.mockResolvedValue({ data: rows, error: null });

    const result = await getSalesLogsSince(USER_ID, SINCE);
    expect(result).toEqual(rows);
    expect(fromMock).toHaveBeenCalledWith('sales_logs');
  });

  it('applies eq(user_id) and gte(logged_at) filters', async () => {
    mockChain.order.mockResolvedValue({ data: [], error: null });

    await getSalesLogsSince(USER_ID, SINCE);

    expect(mockChain.select).toHaveBeenCalledWith('user_id, type, logged_at');
    expect(mockChain.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(mockChain.gte).toHaveBeenCalledWith('logged_at', SINCE);
  });

  it('orders by logged_at descending', async () => {
    mockChain.order.mockResolvedValue({ data: [], error: null });

    await getSalesLogsSince(USER_ID, SINCE);

    expect(mockChain.order).toHaveBeenCalledWith('logged_at', { ascending: false });
  });

  it('throws when supabase returns an error', async () => {
    mockChain.order.mockResolvedValue({
      data: null,
      error: { message: 'db down', code: '500' },
    });

    await expect(getSalesLogsSince(USER_ID, SINCE)).rejects.toMatchObject({
      message: 'db down',
    });
  });

  it('returns [] when result is empty', async () => {
    mockChain.order.mockResolvedValue({ data: [], error: null });
    const result = await getSalesLogsSince(USER_ID, SINCE);
    expect(result).toEqual([]);
  });

  it('returns [] when data is null', async () => {
    mockChain.order.mockResolvedValue({ data: null, error: null });
    const result = await getSalesLogsSince(USER_ID, SINCE);
    expect(result).toEqual([]);
  });
});
