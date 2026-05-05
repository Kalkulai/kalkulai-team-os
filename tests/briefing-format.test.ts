import { describe, it, expect } from 'vitest';
import { formatBriefingMarkdown } from '@/lib/briefing-format';
import type { DailyBriefing, TeamMember, LinearIssue, CalendarEvent } from '@/types';

function makeMember(overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    id: 'test-id',
    name: 'TestUser',
    email: 'test@example.com',
    telegram_chat_id: null,
    linear_user_id: null,
    github_username: null,
    hubspot_owner_id: null,
    google_calendar_id: null,
    google_refresh_token: null,
    google_calendar_email: null,
    notion_user_id: null,
    role: 'dev',
    ...overrides,
  };
}

function makeIssue(id: string, title: string, priority = 0): LinearIssue {
  return {
    id: 'lin-' + id,
    identifier: id,
    title,
    priority,
    state: { name: 'Started', type: 'started' },
    assignee: null,
  };
}

function makeMeeting(start: string, summary: string, isSalesCall = false): CalendarEvent {
  return { id: 'cal-' + start, summary, start, end: start, isSalesCall };
}

function makeBriefing(overrides: Partial<DailyBriefing> = {}): DailyBriefing {
  return {
    member: makeMember(),
    tasks: [],
    meetings: [],
    activeBranch: null,
    weekTargets: { tasks_target: 5, calls_target: 0, bugs_target: 0 },
    weekActuals: { tasks_completed: 0, calls_made: 0, bugs_fixed: 0, commits_count: 0 },
    unprocessedInsights: [],
    ...overrides,
  };
}

describe('formatBriefingMarkdown', () => {
  it('greets the member by name', () => {
    const out = formatBriefingMarkdown(makeBriefing({ member: makeMember({ name: 'Felix' }) }));
    expect(out).toContain('*Guten Morgen, Felix*');
  });

  it('omits Tasks section when empty', () => {
    const out = formatBriefingMarkdown(makeBriefing());
    expect(out).not.toContain('*Deine Tasks*');
  });

  it('renders priority emojis only for urgent and high in top 3', () => {
    const briefing = makeBriefing({
      tasks: [
        makeIssue('KAL-1', 'urgent task', 1),
        makeIssue('KAL-2', 'high task', 2),
        makeIssue('KAL-3', 'medium task', 3),
      ],
    });
    const out = formatBriefingMarkdown(briefing);
    expect(out).toContain('🔥 KAL-1 — urgent task');
    expect(out).toContain('⚡ KAL-2 — high task');
    expect(out).toContain('• KAL-3 — medium task');
    expect(out).not.toContain('🔥 KAL-3');
  });

  it('treats priority 0 (no priority) as lowest rank', () => {
    const briefing = makeBriefing({
      tasks: [
        makeIssue('KAL-none', 'no priority', 0),
        makeIssue('KAL-low', 'low task', 4),
        makeIssue('KAL-med', 'medium task', 3),
      ],
    });
    const out = formatBriefingMarkdown(briefing);
    const noneIdx = out.indexOf('KAL-none');
    const medIdx = out.indexOf('KAL-med');
    expect(medIdx).toBeLessThan(noneIdx);
  });

  it('truncates the task list at 3 items and shows remainder count', () => {
    const tasks = Array.from({ length: 8 }, (_, i) => makeIssue(`KAL-${i}`, `task ${i}`, 3));
    const out = formatBriefingMarkdown(makeBriefing({ tasks }));
    expect(out).toContain('*Top 3 heute*');
    expect(out).toContain('KAL-0');
    expect(out).toContain('KAL-2');
    expect(out).not.toContain('KAL-3');
    expect(out).toContain('…und 5 weitere offen');
  });

  it('puts urgent and high priority tasks before lower ones', () => {
    const tasks = [
      makeIssue('KAL-low', 'low task', 4),
      makeIssue('KAL-medium', 'medium task', 3),
      makeIssue('KAL-urgent', 'urgent task', 1),
      makeIssue('KAL-high', 'high task', 2),
    ];
    const out = formatBriefingMarkdown(makeBriefing({ tasks }));
    const urgentIdx = out.indexOf('KAL-urgent');
    const highIdx = out.indexOf('KAL-high');
    const mediumIdx = out.indexOf('KAL-medium');
    expect(urgentIdx).toBeLessThan(highIdx);
    expect(highIdx).toBeLessThan(mediumIdx);
  });

  it('formats meeting times in HH:mm and marks Sales calls', () => {
    const out = formatBriefingMarkdown(
      makeBriefing({
        meetings: [
          makeMeeting('2026-05-03T07:00:00.000Z', 'Standup'),
          makeMeeting('2026-05-03T13:30:00.000Z', 'Demo Call', true),
        ],
      })
    );
    expect(out).toContain('Standup');
    expect(out).toContain('Demo Call (Sales)');
    expect(out).toMatch(/\d{2}:\d{2} — Standup/);
  });

  it('falls back gracefully on malformed meeting start dates', () => {
    const out = formatBriefingMarkdown(
      makeBriefing({ meetings: [makeMeeting('not-a-date', 'Broken event')] })
    );
    expect(out).toContain('• Broken event');
  });

  it('omits meetings section when no meetings', () => {
    const out = formatBriefingMarkdown(makeBriefing());
    expect(out).not.toContain('*Heute*');
  });

  it('shows Calls KPI only for sales role', () => {
    const dev = formatBriefingMarkdown(
      makeBriefing({
        member: makeMember({ role: 'dev' }),
        weekTargets: { tasks_target: 5, calls_target: 10, bugs_target: 2 },
        weekActuals: { tasks_completed: 1, calls_made: 0, bugs_fixed: 0, commits_count: 0 },
      })
    );
    expect(dev).not.toContain('Calls:');
    expect(dev).toContain('Bugs: 0/2');

    const sales = formatBriefingMarkdown(
      makeBriefing({
        member: makeMember({ role: 'sales' }),
        weekTargets: { tasks_target: 3, calls_target: 10, bugs_target: 0 },
        weekActuals: { tasks_completed: 0, calls_made: 4, bugs_fixed: 0, commits_count: 0 },
      })
    );
    expect(sales).toContain('Calls: 4/10');
    expect(sales).not.toContain('Bugs:');
  });

  it('hides Bugs row for devs when bugs_target is 0', () => {
    const out = formatBriefingMarkdown(
      makeBriefing({
        member: makeMember({ role: 'dev' }),
        weekTargets: { tasks_target: 5, calls_target: 0, bugs_target: 0 },
      })
    );
    expect(out).not.toContain('Bugs:');
  });

  it('renders notion insight headlines when array has entries', () => {
    const empty = formatBriefingMarkdown(makeBriefing({ unprocessedInsights: [] }));
    expect(empty).not.toContain('Customer-Insights');

    const some = formatBriefingMarkdown(
      makeBriefing({
        unprocessedInsights: [
          { id: 'n1', title: 'Däumer Final Pilot', createdAt: '2026-05-02T10:00:00Z', processed: false },
          { id: 'n2', title: 'Kraft Pilotphase', createdAt: '2026-05-01T09:00:00Z', processed: false },
        ],
      })
    );
    expect(some).toContain('*Neue Customer-Insights*');
    expect(some).toContain('💡 Däumer Final Pilot');
    expect(some).toContain('💡 Kraft Pilotphase');
  });

  it('includes the active branch when present', () => {
    const out = formatBriefingMarkdown(makeBriefing({ activeBranch: 'feature/kal-42-login' }));
    expect(out).toContain('feature/kal-42-login');
  });
});
