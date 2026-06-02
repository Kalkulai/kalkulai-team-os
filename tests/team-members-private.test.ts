import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getAllMembersMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  getAllMembers: () => getAllMembersMock(),
}));

vi.mock('@/lib/auth-cookie', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth-cookie')>();
  return {
    ...actual,
    parseAuthCookie: vi.fn(async (value?: string | null) => (
      value === 'valid-cookie' ? { exp: 2_000_000_000, memberId: 'member-1' } : null
    )),
  };
});

import { GET } from '@/app/api/team-members/route';

function request(headers?: HeadersInit): NextRequest {
  return new NextRequest('http://localhost/api/team-members', { headers });
}

describe('/api/team-members private payload', () => {
  beforeEach(() => {
    getAllMembersMock.mockReset();
    delete process.env.DASHBOARD_API_SECRET;
  });

  it('requires dashboard cookie or exact bearer auth', async () => {
    const res = await GET(request());

    expect(res.status).toBe(401);
    expect(getAllMembersMock).not.toHaveBeenCalled();
  });

  it('returns operational member details without raw tokens for dashboard sessions', async () => {
    getAllMembersMock.mockResolvedValue([
      {
        id: 'member-1',
        name: 'Leon',
        role: 'dev',
        email: 'leon@example.test',
        telegram_chat_id: 'telegram-id',
        linear_user_id: 'linear-id',
        github_username: 'lp-kai',
        github_token: 'github-secret',
        github_token_expires_at: '2026-12-31',
        hubspot_owner_id: 'hubspot-id',
        google_calendar_id: 'calendar-id',
        google_refresh_token: 'refresh-secret',
        google_calendar_email: 'calendar@example.test',
        notion_user_id: 'notion-id',
      },
    ]);

    const res = await GET(request({ cookie: 'team-os-auth=valid-cookie' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual([
      {
        id: 'member-1',
        name: 'Leon',
        role: 'dev',
        email: 'leon@example.test',
        telegram_chat_id: 'telegram-id',
        linear_user_id: 'linear-id',
        github_username: 'lp-kai',
        github_token_expires_at: '2026-12-31',
        hubspot_owner_id: 'hubspot-id',
        google_calendar_id: 'calendar-id',
        google_calendar_email: 'calendar@example.test',
        notion_user_id: 'notion-id',
        calendar_connected: true,
        github_connected: true,
      },
    ]);
  });
});
