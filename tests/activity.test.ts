import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TeamMember, CalendarEvent, GitHubBranch, HubSpotCall } from '@/types';
import type { MergedPR, OpenedPR } from '@/lib/github';
import type { CompletedIssue, CreatedIssue } from '@/lib/linear';
import type { SalesLog } from '@/lib/supabase';
import type { CompletedStep, CounterActivity } from '@/lib/kpis';

vi.mock('@/lib/github', () => ({
  getActiveBranches: vi.fn(),
  getRecentlyOpenedPRs: vi.fn(),
}));
vi.mock('@/lib/linear', () => ({
  getCompletedIssuesSince: vi.fn(),
  getCreatedIssuesSince: vi.fn(),
}));
vi.mock('@/lib/hubspot', () => ({
  getCallsThisWeek: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({
  getSalesLogsSince: vi.fn(),
}));
vi.mock('@/lib/kpis', () => ({
  getRecentlyCompletedSteps: vi.fn(),
  getRecentCounterActivity: vi.fn(),
}));

import { buildActivityFeed } from '@/lib/activity';
import { getActiveBranches, getRecentlyOpenedPRs } from '@/lib/github';
import { getCompletedIssuesSince, getCreatedIssuesSince } from '@/lib/linear';
import { getCallsThisWeek } from '@/lib/hubspot';
import { getSalesLogsSince } from '@/lib/supabase';
import { getRecentlyCompletedSteps, getRecentCounterActivity } from '@/lib/kpis';

function makeMember(overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    id: 'mem-1',
    name: 'Felix',
    email: 'felix@example.com',
    telegram_chat_id: null,
    linear_user_id: 'lin-1',
    github_username: 'felix-gh',
    hubspot_owner_id: 'hub-1',
    google_calendar_id: null,
    google_refresh_token: null,
    google_calendar_email: null,
    notion_user_id: null,
    role: 'dev',
    ...overrides,
  };
}

function iso(daysFromToday: number, hour = 12, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function todayMinusMinutes(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function makeMeeting(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'evt-1',
    summary: 'Standup',
    start: iso(0, 9, 0),
    end: iso(0, 9, 30),
    isSalesCall: false,
    ...overrides,
  };
}

function resetMocks() {
  vi.mocked(getActiveBranches).mockResolvedValue([] as GitHubBranch[]);
  vi.mocked(getRecentlyOpenedPRs).mockResolvedValue([] as OpenedPR[]);
  vi.mocked(getCompletedIssuesSince).mockResolvedValue([] as CompletedIssue[]);
  vi.mocked(getCreatedIssuesSince).mockResolvedValue([] as CreatedIssue[]);
  vi.mocked(getCallsThisWeek).mockResolvedValue([] as HubSpotCall[]);
  vi.mocked(getSalesLogsSince).mockResolvedValue([] as SalesLog[]);
  vi.mocked(getRecentlyCompletedSteps).mockResolvedValue([] as CompletedStep[]);
  vi.mocked(getRecentCounterActivity).mockResolvedValue([] as CounterActivity[]);
}

describe('buildActivityFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMocks();
  });

  // --- Meetings ---------------------------------------------------------

  it('renders past meeting as "beendet" event', async () => {
    const past = makeMeeting({
      summary: 'Daily',
      start: todayMinusMinutes(60),
      end: todayMinusMinutes(30),
    });
    const days = await buildActivityFeed(makeMember(), [past]);
    const today = days.find((d) => d.label === 'Heute')!;
    expect(today.events).toHaveLength(1);
    expect(today.events[0].text).toBe('Daily beendet');
    expect(today.events[0].kind).toBe('standup');
    expect(today.events[0].source).toBe('Calendar');
  });

  it('renders running meeting as "läuft seit X min" event', async () => {
    const running = makeMeeting({
      summary: 'Workshop',
      start: todayMinusMinutes(15),
      end: iso(0, 23, 59),
    });
    const days = await buildActivityFeed(makeMember(), [running]);
    const today = days.find((d) => d.label === 'Heute')!;
    expect(today.events).toHaveLength(1);
    expect(today.events[0].text).toMatch(/Workshop läuft seit \d+ min/);
    expect(today.events[0].kind).toBe('standup');
  });

  it('marks sales-call meetings with call kind and Sales source', async () => {
    const callMeeting = makeMeeting({
      summary: 'Demo Acme',
      isSalesCall: true,
      start: todayMinusMinutes(60),
      end: todayMinusMinutes(20),
    });
    const days = await buildActivityFeed(makeMember(), [callMeeting]);
    const today = days.find((d) => d.label === 'Heute')!;
    expect(today.events[0].kind).toBe('call');
    expect(today.events[0].source).toBe('Calendar · Sales');
  });

  it('skips future meetings', async () => {
    const future = makeMeeting({
      start: iso(0, 23, 50),
      end: iso(0, 23, 59),
    });
    const days = await buildActivityFeed(makeMember(), [future]);
    const today = days.find((d) => d.label === 'Heute')!;
    expect(today.events).toHaveLength(0);
  });

  // --- GitHub branches/commits -----------------------------------------

  it('adds own commit on a branch as commit event', async () => {
    vi.mocked(getActiveBranches).mockResolvedValue([
      {
        name: 'feat/x',
        commit: { sha: 'abc', url: '' },
        lastCommitDate: todayMinusMinutes(30),
        authorLogin: 'felix-gh',
      },
    ]);
    const days = await buildActivityFeed(makeMember(), []);
    const today = days.find((d) => d.label === 'Heute')!;
    const commitEvents = today.events.filter((e) => e.kind === 'commit');
    expect(commitEvents).toHaveLength(1);
    expect(commitEvents[0].code).toBe('feat/x');
    expect(commitEvents[0].source).toBe('GitHub');
  });

  it('ignores commits from other authors', async () => {
    vi.mocked(getActiveBranches).mockResolvedValue([
      {
        name: 'feat/y',
        commit: { sha: 'def', url: '' },
        lastCommitDate: todayMinusMinutes(30),
        authorLogin: 'someone-else',
      },
    ]);
    const days = await buildActivityFeed(makeMember(), []);
    expect(days.find((d) => d.label === 'Heute')!.events).toHaveLength(0);
  });

  it('silently skips when getActiveBranches throws', async () => {
    vi.mocked(getActiveBranches).mockRejectedValue(new Error('GitHub down'));
    const days = await buildActivityFeed(makeMember(), []);
    expect(days.find((d) => d.label === 'Heute')!.events).toHaveLength(0);
  });

  // --- Linear completed -------------------------------------------------

  it('adds Linear-completed issue as ok event with source Linear', async () => {
    vi.mocked(getCompletedIssuesSince).mockResolvedValue([
      {
        id: 'iss-1',
        identifier: 'KAI-123',
        title: 'Fix bug',
        completedAt: todayMinusMinutes(20),
      },
    ]);
    const days = await buildActivityFeed(makeMember(), []);
    const today = days.find((d) => d.label === 'Heute')!;
    const ok = today.events.find((e) => e.kind === 'ok' && e.source === 'Linear');
    expect(ok).toBeDefined();
    expect(ok!.text).toBe('KAI-123 erledigt');
    expect(ok!.code).toBe('Fix bug');
  });

  it('does not call Linear when member has no linear_user_id', async () => {
    await buildActivityFeed(makeMember({ linear_user_id: null }), []);
    expect(getCompletedIssuesSince).not.toHaveBeenCalled();
    expect(getCreatedIssuesSince).not.toHaveBeenCalled();
  });

  // --- Linear created (Hermes-vs-normal) -------------------------------

  it('marks Hermes-labelled created issue as hermes/Hermes', async () => {
    vi.mocked(getCreatedIssuesSince).mockResolvedValue([
      {
        id: 'iss-2',
        identifier: 'KAI-200',
        title: 'New feature',
        createdAt: todayMinusMinutes(10),
        labels: ['Hermes', 'feature'],
      },
    ]);
    const days = await buildActivityFeed(makeMember(), []);
    const today = days.find((d) => d.label === 'Heute')!;
    const hermes = today.events.find((e) => e.kind === 'hermes');
    expect(hermes).toBeDefined();
    expect(hermes!.text).toBe('KAI-200 via Hermes');
    expect(hermes!.source).toBe('Hermes');
  });

  it('marks normal created issue as create/Linear with "erstellt"', async () => {
    vi.mocked(getCreatedIssuesSince).mockResolvedValue([
      {
        id: 'iss-3',
        identifier: 'KAI-201',
        title: 'Refactor',
        createdAt: todayMinusMinutes(5),
        labels: [],
      },
    ]);
    const days = await buildActivityFeed(makeMember(), []);
    const today = days.find((d) => d.label === 'Heute')!;
    const create = today.events.find(
      (e) => e.kind === 'create' && e.source === 'Linear' && /erstellt/.test(String(e.text)),
    );
    expect(create).toBeDefined();
    expect(create!.text).toBe('KAI-201 erstellt');
  });

  // --- HubSpot calls ----------------------------------------------------

  it('renders a single HubSpot-call as call event for sales role', async () => {
    vi.mocked(getCallsThisWeek).mockResolvedValue([
      {
        id: 'c-1',
        timestamp: todayMinusMinutes(45),
        duration: 5 * 60_000,
        ownerId: 'hub-1',
      },
    ]);
    const days = await buildActivityFeed(makeMember({ role: 'sales' }), []);
    const today = days.find((d) => d.label === 'Heute')!;
    const calls = today.events.filter((e) => e.kind === 'call' && e.source === 'HubSpot');
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toBe('Call (5 min)');
  });

  it('clusters consecutive HubSpot calls into one session event', async () => {
    // 5 Cold-Calls innerhalb 25 Minuten — sollten zu EINEM Eintrag werden
    vi.mocked(getCallsThisWeek).mockResolvedValue([
      { id: 'c-1', timestamp: todayMinusMinutes(60), duration: 60_000, ownerId: 'hub-1' },
      { id: 'c-2', timestamp: todayMinusMinutes(55), duration: 60_000, ownerId: 'hub-1' },
      { id: 'c-3', timestamp: todayMinusMinutes(50), duration: 60_000, ownerId: 'hub-1' },
      { id: 'c-4', timestamp: todayMinusMinutes(40), duration: 60_000, ownerId: 'hub-1' },
      { id: 'c-5', timestamp: todayMinusMinutes(35), duration: 60_000, ownerId: 'hub-1' },
    ]);
    const days = await buildActivityFeed(makeMember({ role: 'sales' }), []);
    const today = days.find((d) => d.label === 'Heute')!;
    const calls = today.events.filter((e) => e.kind === 'call' && e.source === 'HubSpot');
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toMatch(/^5 Calls · \d{2}:\d{2}–\d{2}:\d{2}$/);
  });

  it('keeps calls separated by long gaps in separate sessions', async () => {
    // Morgen-Session + Nachmittags-Session, >30 min Pause → 2 Einträge
    vi.mocked(getCallsThisWeek).mockResolvedValue([
      { id: 'c-1', timestamp: todayMinusMinutes(240), duration: 60_000, ownerId: 'hub-1' },
      { id: 'c-2', timestamp: todayMinusMinutes(235), duration: 60_000, ownerId: 'hub-1' },
      { id: 'c-3', timestamp: todayMinusMinutes(60), duration: 60_000, ownerId: 'hub-1' },
      { id: 'c-4', timestamp: todayMinusMinutes(55), duration: 60_000, ownerId: 'hub-1' },
    ]);
    const days = await buildActivityFeed(makeMember({ role: 'sales' }), []);
    const today = days.find((d) => d.label === 'Heute')!;
    const calls = today.events.filter((e) => e.kind === 'call' && e.source === 'HubSpot');
    expect(calls).toHaveLength(2);
    expect(calls.every((c) => /^2 Calls · /.test(String(c.text)))).toBe(true);
  });

  it('ignores HubSpot when role is not sales', async () => {
    vi.mocked(getCallsThisWeek).mockResolvedValue([
      {
        id: 'c-2',
        timestamp: todayMinusMinutes(10),
        duration: 60_000,
        ownerId: 'hub-1',
      },
    ]);
    await buildActivityFeed(makeMember({ role: 'dev' }), []);
    expect(getCallsThisWeek).not.toHaveBeenCalled();
  });

  // --- PR opened --------------------------------------------------------

  it('renders own opened PR as pr-open event with repo tag', async () => {
    vi.mocked(getRecentlyOpenedPRs).mockResolvedValue([
      {
        number: 42,
        title: 'New feature',
        createdAt: todayMinusMinutes(15),
        author: 'felix-gh',
        headRef: 'feat/new',
        isBot: false,
        repo: 'Kalkulai/kalkulai',
      },
    ]);
    const days = await buildActivityFeed(makeMember(), []);
    const today = days.find((d) => d.label === 'Heute')!;
    const prOpen = today.events.find((e) => e.kind === 'pr-open');
    expect(prOpen).toBeDefined();
    expect(prOpen!.text).toBe('PR #42 geöffnet');
    expect(prOpen!.source).toBe('kalkulai');
    expect(prOpen!.code).toBe('feat/new');
  });

  it('ignores PRs opened by other authors', async () => {
    vi.mocked(getRecentlyOpenedPRs).mockResolvedValue([
      {
        number: 99,
        title: 'Other',
        createdAt: todayMinusMinutes(5),
        author: 'someone',
        headRef: 'misc',
        isBot: false,
        repo: 'Kalkulai/kalkulai',
      },
    ]);
    const days = await buildActivityFeed(makeMember(), []);
    expect(
      days.find((d) => d.label === 'Heute')!.events.find((e) => e.kind === 'pr-open'),
    ).toBeUndefined();
  });

  // --- Project step completions ----------------------------------------

  it('renders completed step as step-done event with Projects source and parent prefix', async () => {
    vi.mocked(getRecentlyCompletedSteps).mockResolvedValue([
      {
        id: 'step-1',
        name: 'Design fertig',
        completed_at: todayMinusMinutes(25),
        parent_name: 'Landing Page',
      },
    ]);
    const days = await buildActivityFeed(makeMember(), []);
    const today = days.find((d) => d.label === 'Heute')!;
    const step = today.events.find((e) => e.kind === 'step-done' && e.source === 'Projects');
    expect(step).toBeDefined();
    expect(step!.text).toBe('Teilschritt erledigt');
    expect(step!.code).toBe('Landing Page: Design fertig');
  });

  it('renders step without parent as just the step name', async () => {
    vi.mocked(getRecentlyCompletedSteps).mockResolvedValue([
      {
        id: 'step-2',
        name: 'Orphan-Step',
        completed_at: todayMinusMinutes(10),
        parent_name: null,
      },
    ]);
    const days = await buildActivityFeed(makeMember(), []);
    const today = days.find((d) => d.label === 'Heute')!;
    const step = today.events.find((e) => e.source === 'Projects');
    expect(step!.code).toBe('Orphan-Step');
  });

  it('silently skips when getRecentlyCompletedSteps throws', async () => {
    vi.mocked(getRecentlyCompletedSteps).mockRejectedValue(new Error('DB down'));
    const days = await buildActivityFeed(makeMember(), []);
    expect(days.find((d) => d.label === 'Heute')!.events).toHaveLength(0);
  });

  // --- Sales logs -------------------------------------------------------

  it('renders only demo sales-logs as call event (cold-calls/follow-ups filtered out)', async () => {
    vi.mocked(getSalesLogsSince).mockResolvedValue([
      { user_id: 'mem-1', type: 'cold-call', logged_at: todayMinusMinutes(60) },
      { user_id: 'mem-1', type: 'follow-up', logged_at: todayMinusMinutes(40) },
      { user_id: 'mem-1', type: 'demo', logged_at: todayMinusMinutes(20) },
    ]);
    const days = await buildActivityFeed(makeMember({ role: 'sales' }), []);
    const today = days.find((d) => d.label === 'Heute')!;
    const manual = today.events.filter((e) => e.kind === 'call' && e.source === 'Manual');
    expect(manual).toHaveLength(1);
    expect(manual[0].text).toBe('Demo');
  });

  it('does not call getSalesLogsSince when role is not sales', async () => {
    await buildActivityFeed(makeMember({ role: 'dev' }), []);
    expect(getSalesLogsSince).not.toHaveBeenCalled();
  });

  it('silently skips when getSalesLogsSince throws', async () => {
    vi.mocked(getSalesLogsSince).mockRejectedValue(new Error('Supabase down'));
    const days = await buildActivityFeed(makeMember({ role: 'sales' }), []);
    expect(days.find((d) => d.label === 'Heute')!.events).toHaveLength(0);
  });

  // --- Merged PRs (passed via 3rd param) -------------------------------

  it('renders own merged PR as merge event with repo tag', async () => {
    const merged: MergedPR[] = [
      {
        number: 7,
        title: 'My PR',
        mergedAt: todayMinusMinutes(60),
        merger: 'felix-gh',
        headRef: 'fix/x',
        isBot: false,
        repo: 'Kalkulai/kalkulai',
      },
    ];
    const days = await buildActivityFeed(makeMember(), [], merged);
    const today = days.find((d) => d.label === 'Heute')!;
    const mergeEv = today.events.find((e) => e.kind === 'merge' && e.text === 'PR #7 gemerged');
    expect(mergeEv).toBeDefined();
    expect(mergeEv!.source).toBe('kalkulai');
    expect(mergeEv!.code).toBe('fix/x');
  });

  it('marks Dependabot merge as dep kind with Dependabot source suffix', async () => {
    const merged: MergedPR[] = [
      {
        number: 11,
        title: 'Bump foo',
        mergedAt: todayMinusMinutes(120),
        merger: 'felix-gh',
        headRef: 'dependabot/npm_and_yarn/foo',
        isBot: true,
        repo: 'Kalkulai/kalkulai',
      },
    ];
    const days = await buildActivityFeed(makeMember(), [], merged);
    const today = days.find((d) => d.label === 'Heute')!;
    const dep = today.events.find((e) => e.text === 'Dependency-Update #11 gemerged');
    expect(dep).toBeDefined();
    expect(dep!.kind).toBe('dep');
    expect(dep!.source).toBe('kalkulai · Dependabot');
  });

  // --- Sorting + structure ---------------------------------------------

  it('sorts events newest first within today', async () => {
    vi.mocked(getSalesLogsSince).mockResolvedValue([
      { user_id: 'mem-1', type: 'demo', logged_at: todayMinusMinutes(120) },
      { user_id: 'mem-1', type: 'demo', logged_at: todayMinusMinutes(30) },
    ]);
    const days = await buildActivityFeed(makeMember({ role: 'sales' }), []);
    const today = days.find((d) => d.label === 'Heute')!;
    expect(today.events.length).toBeGreaterThanOrEqual(2);
    const times = today.events.map((e) => e.time);
    const sortedDesc = [...times].sort((a, b) => b.localeCompare(a));
    expect(times).toEqual(sortedDesc);
  });

  it('emits Heute day even when no events', async () => {
    const days = await buildActivityFeed(makeMember(), []);
    expect(days[0].label).toBe('Heute');
    expect(days).toHaveLength(1);
  });

  it('adds Gestern day when yesterday-events exist', async () => {
    const yesterdayNoon = new Date();
    yesterdayNoon.setDate(yesterdayNoon.getDate() - 1);
    yesterdayNoon.setHours(12, 0, 0, 0);
    vi.mocked(getCompletedIssuesSince).mockResolvedValue([
      {
        id: 'iss-y',
        identifier: 'KAI-7',
        title: 'Yesterday task',
        completedAt: yesterdayNoon.toISOString(),
      },
    ]);
    const days = await buildActivityFeed(makeMember(), []);
    expect(days.find((d) => d.label === 'Gestern')).toBeDefined();
  });

  // --- Counter -----------------------------------------------------------

  it('renders today counter delta as +N {unit} event', async () => {
    const today = new Date().toISOString().slice(0, 10);
    vi.mocked(getRecentCounterActivity).mockResolvedValue([
      { kpi_id: 'k1', kpi_name: 'Sales Calls', unit: 'Anrufe', day: today, delta: 3 },
    ]);
    const days = await buildActivityFeed(makeMember(), []);
    const ev = days.find((d) => d.label === 'Heute')!.events.find((e) => e.kind === 'counter');
    expect(ev).toBeDefined();
    expect(ev!.text).toBe('+3 Anrufe');
    expect(ev!.source).toBe('KPIs');
  });

  it('falls back to kpi_name when unit is empty', async () => {
    const today = new Date().toISOString().slice(0, 10);
    vi.mocked(getRecentCounterActivity).mockResolvedValue([
      { kpi_id: 'k2', kpi_name: 'Commits', unit: '', day: today, delta: 1 },
    ]);
    const days = await buildActivityFeed(makeMember(), []);
    const ev = days.find((d) => d.label === 'Heute')!.events.find((e) => e.kind === 'counter');
    expect(ev?.text).toBe('+1 Commits');
  });

  it('places yesterday counter deltas in Gestern bucket', async () => {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const yesterdayDay = y.toISOString().slice(0, 10);
    vi.mocked(getRecentCounterActivity).mockResolvedValue([
      { kpi_id: 'k3', kpi_name: 'Demos', unit: 'Demos', day: yesterdayDay, delta: 2 },
    ]);
    const days = await buildActivityFeed(makeMember(), []);
    const yest = days.find((d) => d.label === 'Gestern');
    expect(yest).toBeDefined();
    expect(yest!.events.some((e) => e.kind === 'counter' && e.text === '+2 Demos')).toBe(true);
  });

  it('silently skips when getRecentCounterActivity throws', async () => {
    vi.mocked(getRecentCounterActivity).mockRejectedValue(new Error('boom'));
    const days = await buildActivityFeed(makeMember(), []);
    expect(days.find((d) => d.label === 'Heute')!.events.some((e) => e.kind === 'counter')).toBe(false);
  });
});
