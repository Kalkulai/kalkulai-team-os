import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase', () => ({
  getAllMembers: vi.fn(),
}));

vi.mock('@/lib/aggregator', () => ({
  buildDailyBriefing: vi.fn(),
}));

vi.mock('@/lib/telegram', () => ({
  sendTelegramMessage: vi.fn(),
}));

vi.mock('@/lib/briefing-format', () => ({
  formatBriefingMarkdown: vi.fn(),
}));

import { GET } from '@/app/api/briefing/send/route';

function request(auth?: string): NextRequest {
  const headers = new Headers();
  if (auth) headers.set('authorization', auth);
  return new NextRequest('http://localhost/api/briefing/send', { headers });
}

describe('/api/briefing/send auth', () => {
  beforeEach(() => {
    delete process.env.CRON_SECRET;
    delete process.env.DASHBOARD_API_SECRET;
  });

  it('does not accept Bearer undefined when CRON_SECRET is missing', async () => {
    const res = await GET(request('Bearer undefined'));

    expect(res.status).toBe(401);
  });

  it('accepts the configured cron secret', async () => {
    process.env.CRON_SECRET = 'cron-secret';
    const { getAllMembers } = await import('@/lib/supabase');
    vi.mocked(getAllMembers).mockResolvedValue([]);

    const res = await GET(request('Bearer cron-secret'));

    expect(res.status).toBe(200);
  });
});
