import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TeamMember, CalendarEvent, GitHubBranch } from '@/types';

vi.mock('@/lib/linear', () => ({
  getIssuesForUser: vi.fn(),
}));
vi.mock('@/lib/calendar', () => ({
  getTodayEvents: vi.fn(),
  countSalesCallsToday: vi.fn(),
}));
vi.mock('@/lib/github', () => ({
  getActiveBranches: vi.fn(),
  getCommitsThisWeek: vi.fn(),
}));
vi.mock('@/lib/hubspot', () => ({
  getCallsThisWeek: vi.fn(),
}));
vi.mock('@/lib/notion', () => ({
  countUnprocessedInsights: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({
  getWeekTargets: vi.fn(),
  getWeekActuals: vi.fn(),
  currentWeekStart: vi.fn(() => '2026-04-27'),
  supabaseAdmin: {
    from: vi.fn(() => ({
      upsert: vi.fn(() => Promise.resolve({ error: null })),
    })),
  },
}));

import { buildDailyBriefing } from '@/lib/aggregator';
import { getIssuesForUser } from '@/lib/linear';
import { getTodayEvents, countSalesCallsToday } from '@/lib/calendar';
import { getActiveBranches, getCommitsThisWeek } from '@/lib/github';
import { getCallsThisWeek } from '@/lib/hubspot';
import { countUnprocessedInsights } from '@/lib/notion';
import { getWeekTargets, getWeekActuals, supabaseAdmin } from '@/lib/supabase';

function makeMember(overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    id: 'mem-1',
    name: 'Felix',
    email: 'felix@example.com',
    telegram_chat_id: null,
    linear_user_id: 'lin-1',
    github_username: 'felix-gh',
    hubspot_owner_id: null,
    google_calendar_id: null,
    role: 'dev',
    ...overrides,
  };
}

const baseTargets = { tasks_target: 5, calls_target: 0, bugs_target: 2 };
const baseActuals = { tasks_completed: 1, calls_made: 0, bugs_fixed: 0, commits_count: 0 };

describe('buildDailyBriefing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getIssuesForUser).mockResolvedValue([]);
    vi.mocked(getTodayEvents).mockResolvedValue([]);
    vi.mocked(countSalesCallsToday).mockReturnValue(0);
    vi.mocked(getActiveBranches).mockResolvedValue([]);
    vi.mocked(getCommitsThisWeek).mockResolvedValue(0);
    vi.mocked(getCallsThisWeek).mockResolvedValue([]);
    vi.mocked(countUnprocessedInsights).mockResolvedValue(0);
    vi.mocked(getWeekTargets).mockResolvedValue(baseTargets);
    vi.mocked(getWeekActuals).mockResolvedValue(baseActuals);
  });

  it('aggregates a minimal dev briefing', async () => {
    const result = await buildDailyBriefing(makeMember());
    expect(result.member.name).toBe('Felix');
    expect(result.tasks).toEqual([]);
    expect(result.weekTargets).toEqual(baseTargets);
    expect(result.weekActuals.tasks_completed).toBe(1);
    expect(result.activeBranch).toBeNull();
  });

  it('skips Linear lookup when linear_user_id is null', async () => {
    await buildDailyBriefing(makeMember({ linear_user_id: null }));
    expect(getIssuesForUser).not.toHaveBeenCalled();
  });

  it('skips Calendar when google_calendar_id is null (Felix/Paul case)', async () => {
    await buildDailyBriefing(makeMember({ google_calendar_id: null }));
    expect(getTodayEvents).not.toHaveBeenCalled();
  });

  it('calls Calendar with the configured calendar id', async () => {
    await buildDailyBriefing(makeMember({ google_calendar_id: 'primary' }));
    expect(getTodayEvents).toHaveBeenCalledWith('primary');
  });

  it('adds GitHub commits in-memory for dev role only', async () => {
    vi.mocked(getCommitsThisWeek).mockResolvedValue(7);
    const dev = await buildDailyBriefing(makeMember({ role: 'dev' }));
    expect(dev.weekActuals.commits_count).toBe(7);

    vi.mocked(getCallsThisWeek).mockResolvedValue([]);
    const sales = await buildDailyBriefing(makeMember({ role: 'sales', github_username: 'paul-gh' }));
    expect(sales.weekActuals.commits_count).toBe(0);
  });

  it('adds HubSpot calls in-memory for sales role only', async () => {
    vi.mocked(getCallsThisWeek).mockResolvedValue([
      { id: 'c1', timestamp: '', duration: 0, ownerId: 'hs-1' },
      { id: 'c2', timestamp: '', duration: 0, ownerId: 'hs-1' },
    ]);
    const sales = await buildDailyBriefing(
      makeMember({ role: 'sales', hubspot_owner_id: 'hs-1' })
    );
    expect(sales.weekActuals.calls_made).toBe(0 + 2);
  });

  it('finds the active branch by github_username', async () => {
    const branches: GitHubBranch[] = [
      { name: 'main', commit: { sha: 'a', url: '' } },
      { name: 'feature/email', commit: { sha: 'b', url: '' }, authorLogin: 'felix-gh' },
      { name: 'fix/other', commit: { sha: 'c', url: '' }, authorLogin: 'someone-else' },
    ];
    vi.mocked(getActiveBranches).mockResolvedValue(branches);
    const result = await buildDailyBriefing(makeMember({ github_username: 'felix-gh' }));
    expect(result.activeBranch).toBe('feature/email');
  });

  it('returns null activeBranch when no branch matches the user', async () => {
    vi.mocked(getActiveBranches).mockResolvedValue([
      { name: 'main', commit: { sha: 'a', url: '' }, authorLogin: 'someone-else' },
    ]);
    const result = await buildDailyBriefing(makeMember({ github_username: 'felix-gh' }));
    expect(result.activeBranch).toBeNull();
  });

  it('is resilient to a single failing API (Promise.allSettled)', async () => {
    vi.mocked(getIssuesForUser).mockRejectedValue(new Error('linear down'));
    const result = await buildDailyBriefing(makeMember());
    expect(result.tasks).toEqual([]);
    expect(result.weekTargets).toEqual(baseTargets);
  });

  it('persists detected calendar sales calls into kpi_daily for sales members', async () => {
    const meeting: CalendarEvent = {
      id: 'm1',
      summary: 'Demo Call',
      start: '2026-05-03T13:30:00.000Z',
      end: '2026-05-03T14:00:00.000Z',
      isSalesCall: true,
    };
    vi.mocked(getTodayEvents).mockResolvedValue([meeting]);
    vi.mocked(countSalesCallsToday).mockReturnValue(1);

    const upsert = vi.fn(() => Promise.resolve({ error: null }));
    vi.mocked(supabaseAdmin.from).mockReturnValue({ upsert } as never);

    await buildDailyBriefing(makeMember({ role: 'sales', google_calendar_id: 'primary' }));

    expect(supabaseAdmin.from).toHaveBeenCalledWith('kpi_daily');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'mem-1', calls_made: 1 }),
      expect.objectContaining({ onConflict: 'user_id,date' })
    );
  });

  it('does not persist calendar calls for dev members', async () => {
    vi.mocked(getTodayEvents).mockResolvedValue([]);
    vi.mocked(countSalesCallsToday).mockReturnValue(0);

    const upsert = vi.fn(() => Promise.resolve({ error: null }));
    vi.mocked(supabaseAdmin.from).mockReturnValue({ upsert } as never);

    await buildDailyBriefing(makeMember({ role: 'dev', google_calendar_id: 'primary' }));

    expect(upsert).not.toHaveBeenCalled();
  });

  it('forwards unprocessed Notion-Insights count', async () => {
    vi.mocked(countUnprocessedInsights).mockResolvedValue(3);
    const result = await buildDailyBriefing(makeMember());
    expect(result.unprocessedInsights).toBe(3);
  });
});
