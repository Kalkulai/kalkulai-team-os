import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAllMembersMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  getAllMembers: () => getAllMembersMock(),
}));

import { GET } from '@/app/api/members/route';

describe('/api/members public payload', () => {
  beforeEach(() => {
    getAllMembersMock.mockReset();
  });

  it('returns only public member fields and derived connection booleans', async () => {
    getAllMembersMock.mockResolvedValue([
      {
        id: 'member-1',
        name: 'Leon',
        role: 'dev',
        email: 'leon@example.test',
        telegram_chat_id: 'telegram-secret',
        linear_user_id: 'linear-secret',
        github_username: 'lp-kai',
        github_token: 'github-secret',
        github_token_expires_at: '2026-12-31',
        hubspot_owner_id: 'hubspot-secret',
        google_calendar_id: 'calendar-secret',
        google_refresh_token: 'refresh-secret',
        google_calendar_email: 'calendar@example.test',
        notion_user_id: 'notion-secret',
      },
    ]);

    const res = await GET();
    const json = await res.json();

    expect(json).toEqual([
      {
        id: 'member-1',
        name: 'Leon',
        role: 'dev',
        github_username: 'lp-kai',
        calendar_connected: true,
        github_connected: true,
      },
    ]);
  });
});
