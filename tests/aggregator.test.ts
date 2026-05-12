import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TeamMember, CalendarEvent, GitHubBranch } from '@/types';

vi.mock('@/lib/linear', () => ({
  getIssuesForUser: vi.fn(),
  getBugsFixedThisWeek: vi.fn(),
  getTasksCompletedThisWeek: vi.fn(),
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
  getTopUnprocessedInsights: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({
  getWeekTargets: vi.fn(),
  getWeekActuals: vi.fn(),
  getSalesCallsThisWeek: vi.fn(),
  currentWeekStart: vi.fn(() => '2026-04-27'),
  supabaseAdmin: {
    from: vi.fn(() => ({
      upsert: vi.fn(() => Promise.resolve({ error: null })),
    })),
  },
}));

import { buildDailyBriefing } from '@/lib/aggregator';
import { getIssuesForUser, getBugsFixedThisWeek, getTasksCompletedThisWeek } from '@/lib/linear';
import { getTodayEvents, countSalesCallsToday } from '@/lib/calendar';
import { getActiveBranches, getCommitsThisWeek } from '@/lib/github';
import { getCallsThisWeek } from '@/lib/hubspot';
import { getTopUnprocessedInsights } from '@/lib/notion';
import { getWeekTargets, getWeekActuals, supabaseAdmin, getSalesCallsThisWeek } from '@/lib/supabase';

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
    google_refresh_token: null,
    google_calendar_email: null,
    notion_user_id: null,
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
    vi.mocked(getBugsFixedThisWeek).mockResolvedValue(0);
    vi.mocked(getTasksCompletedThisWeek).mockResolvedValue(0);
    vi.mocked(getCallsThisWeek).mockResolvedValue([]);
    vi.mocked(getSalesCallsThisWeek).mockResolvedValue(0);
    vi.mocked(getTopUnprocessedInsights).mockResolvedValue([]);
    vi.mocked(getWeekTargets).mockResolvedValue(baseTargets);
    vi.mocked(getWeekActuals).mockResolvedValue(baseActuals);
  });

  it('aggregates a minimal dev briefing', async () => {
    const result = await buildDailyBriefing(makeMember());
    expect(result.member.name).toBe('Felix');
    expect(result.tasks).toEqual([]);
    expect(result.weekTargets).toEqual(baseTargets);
    // tasks_completed comes from Linear (mocked to 0 in beforeEach), no longer from kpi_daily
    expect(result.weekActuals.tasks_completed).toBe(0);
    expect(result.activeBranches).toEqual([]);
  });

  it('skips Linear lookup when linear_user_id is null', async () => {
    await buildDailyBriefing(makeMember({ linear_user_id: null }));
    expect(getIssuesForUser).not.toHaveBeenCalled();
  });

  it('always calls Calendar with the member object (token selection happens inside)', async () => {
    const member = makeMember({ google_calendar_id: null });
    await buildDailyBriefing(member);
    expect(getTodayEvents).toHaveBeenCalledWith(member);
  });

  it('passes the full member into Calendar when calendar id is set', async () => {
    const member = makeMember({ google_calendar_id: 'primary' });
    await buildDailyBriefing(member);
    expect(getTodayEvents).toHaveBeenCalledWith(member);
  });

  it('adds GitHub commits in-memory for dev role only', async () => {
    vi.mocked(getCommitsThisWeek).mockResolvedValue(7);
    const dev = await buildDailyBriefing(makeMember({ role: 'dev' }));
    expect(dev.weekActuals.commits_count).toBe(7);

    vi.mocked(getCallsThisWeek).mockResolvedValue([]);
    const sales = await buildDailyBriefing(makeMember({ role: 'sales', github_username: 'paul-gh' }));
    expect(sales.weekActuals.commits_count).toBe(0);
  });

  it('adds sales_logs cold-calls in-memory for sales role only', async () => {
    vi.mocked(getSalesCallsThisWeek).mockResolvedValue(2);
    const sales = await buildDailyBriefing(makeMember({ role: 'sales' }));
    expect(sales.weekActuals.calls_made).toBe(0 + 2);
    expect(getSalesCallsThisWeek).toHaveBeenCalledWith('mem-1');
  });

  it('does not call getSalesCallsThisWeek for dev members', async () => {
    await buildDailyBriefing(makeMember({ role: 'dev' }));
    expect(getSalesCallsThisWeek).not.toHaveBeenCalled();
  });

  it('collects all branches authored by the user across repos', async () => {
    const branches: GitHubBranch[] = [
      { name: 'main', commit: { sha: 'a', url: '' } },
      { name: 'feature/email', commit: { sha: 'b', url: '' }, authorLogin: 'felix-gh', lastCommitDate: '2026-05-10T10:00:00Z', repo: 'Kalkulai/kalkulai' },
      { name: 'feature/api', commit: { sha: 'b2', url: '' }, authorLogin: 'felix-gh', lastCommitDate: '2026-05-11T09:00:00Z', repo: 'Kalkulai/kalkulai-team-os' },
      { name: 'fix/other', commit: { sha: 'c', url: '' }, authorLogin: 'someone-else' },
    ];
    vi.mocked(getActiveBranches).mockResolvedValue(branches);
    const result = await buildDailyBriefing(makeMember({ github_username: 'felix-gh' }));
    expect(result.activeBranches.map((b) => b.name)).toEqual(['feature/api', 'feature/email']);
  });

  it('also matches branches assigned via prAssignee or prRequestedReviewer', async () => {
    const branches: GitHubBranch[] = [
      { name: 'review/me', commit: { sha: 'r', url: '' }, authorLogin: 'someone-else', prRequestedReviewer: 'felix-gh', lastCommitDate: '2026-05-09T08:00:00Z' },
      { name: 'assigned/me', commit: { sha: 'a', url: '' }, authorLogin: 'someone-else', prAssignee: 'felix-gh', lastCommitDate: '2026-05-10T08:00:00Z' },
    ];
    vi.mocked(getActiveBranches).mockResolvedValue(branches);
    const result = await buildDailyBriefing(makeMember({ github_username: 'felix-gh' }));
    expect(result.activeBranches.map((b) => b.name)).toEqual(['assigned/me', 'review/me']);
  });

  it('returns empty activeBranches when no branch matches the user', async () => {
    vi.mocked(getActiveBranches).mockResolvedValue([
      { name: 'main', commit: { sha: 'a', url: '' }, authorLogin: 'someone-else' },
    ]);
    const result = await buildDailyBriefing(makeMember({ github_username: 'felix-gh' }));
    expect(result.activeBranches).toEqual([]);
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

  it('forwards top unprocessed Notion insights as array', async () => {
    vi.mocked(getTopUnprocessedInsights).mockResolvedValue([
      { id: 'n1', title: 'Insight A', createdAt: '2026-05-01T00:00:00Z', processed: false },
      { id: 'n2', title: 'Insight B', createdAt: '2026-04-30T00:00:00Z', processed: false },
    ]);
    const result = await buildDailyBriefing(makeMember());
    expect(result.unprocessedInsights).toHaveLength(2);
    expect(result.unprocessedInsights[0].title).toBe('Insight A');
  });

  it('uses Linear completedAt as source of truth for tasks_completed', async () => {
    vi.mocked(getTasksCompletedThisWeek).mockResolvedValue(7);
    const result = await buildDailyBriefing(makeMember({ linear_user_id: 'lin-1' }));
    expect(result.weekActuals.tasks_completed).toBe(7);
    expect(getTasksCompletedThisWeek).toHaveBeenCalledWith('lin-1');
  });

  it('falls back to 0 tasks_completed when no linear_user_id', async () => {
    const result = await buildDailyBriefing(makeMember({ linear_user_id: null }));
    expect(result.weekActuals.tasks_completed).toBe(0);
    expect(getTasksCompletedThisWeek).not.toHaveBeenCalled();
  });

  it('adds bugs_fixed in-memory for dev role with linear_user_id', async () => {
    vi.mocked(getBugsFixedThisWeek).mockResolvedValue(4);
    const dev = await buildDailyBriefing(makeMember({ role: 'dev', linear_user_id: 'lin-1' }));
    expect(dev.weekActuals.bugs_fixed).toBe(4);
    expect(getBugsFixedThisWeek).toHaveBeenCalledWith('lin-1');
  });

  it('does not call getBugsFixedThisWeek for sales members', async () => {
    await buildDailyBriefing(makeMember({ role: 'sales', linear_user_id: 'lin-1' }));
    expect(getBugsFixedThisWeek).not.toHaveBeenCalled();
  });

  it('skips bugs_fixed when linear_user_id is null', async () => {
    await buildDailyBriefing(makeMember({ role: 'dev', linear_user_id: null }));
    expect(getBugsFixedThisWeek).not.toHaveBeenCalled();
  });

  it('keeps bugs_fixed at 0 when the Linear bug query fails', async () => {
    vi.mocked(getBugsFixedThisWeek).mockRejectedValue(new Error('linear down'));
    const result = await buildDailyBriefing(makeMember({ role: 'dev', linear_user_id: 'lin-1' }));
    expect(result.weekActuals.bugs_fixed).toBe(0);
  });
});
