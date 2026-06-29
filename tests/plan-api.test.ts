import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { AUTH_COOKIE_NAME, signAuthCookie } from '@/lib/auth-cookie';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const getIssuesForUserMock = vi.fn();
const getTaskMetaByIssueIdsMock = vi.fn();
const supabaseAdminFromMock = vi.fn();

vi.mock('@/lib/linear', () => ({
  getIssuesForUser: (...a: unknown[]) => getIssuesForUserMock(...a),
  createIssue: vi.fn(),
  getLinearTeamId: vi.fn().mockResolvedValue('team-1'),
  setIssueStatus: vi.fn(),
  archiveIssue: vi.fn(),
  updateIssue: vi.fn(),
}));

const upsertTaskMetaMock = vi.fn();
vi.mock('@/lib/task-meta-db', () => ({
  getTaskMetaByIssueIds: (...a: unknown[]) => getTaskMetaByIssueIdsMock(...a),
  upsertTaskMeta: (...a: unknown[]) => upsertTaskMetaMock(...a),
  deleteTaskMeta: vi.fn(),
}));

const supabaseSelect = vi.fn();
const supabaseEq = vi.fn();
const supabaseSingle = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({ eq: () => ({ single: supabaseSingle }) }),
    }),
  },
  currentWeekStart: () => '2026-06-23',
}));

vi.mock('@/lib/revalidate', () => ({ revalidateDashboard: vi.fn() }));

import { GET } from '@/app/api/plan/tasks/route';
import { PATCH } from '@/app/api/plan/tasks/[id]/route';

const AUTH_SECRET = 'test-auth-secret-with-enough-bytes';
const FELIX_ID = 'c9677ade-e42c-4593-81c6-7a2108b145fd';
const LINEAR_USER_ID = 'linear-user-felix';

function req(url: string, bearer?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  return new NextRequest(url, { headers });
}

describe('GET /api/plan/tasks', () => {
  beforeEach(() => {
    process.env.DASHBOARD_API_SECRET = AUTH_SECRET;
    supabaseSingle.mockResolvedValue({
      data: { id: FELIX_ID, linear_user_id: LINEAR_USER_ID },
      error: null,
    });
    getIssuesForUserMock.mockResolvedValue([]);
    getTaskMetaByIssueIdsMock.mockResolvedValue({});
  });

  afterEach(() => {
    delete process.env.DASHBOARD_API_SECRET;
    vi.clearAllMocks();
  });

  it('returns 401 without auth', async () => {
    const res = await GET(req(`http://localhost/api/plan/tasks?userId=${FELIX_ID}`));
    expect(res.status).toBe(401);
  });

  it('returns 400 when userId missing', async () => {
    const res = await GET(req('http://localhost/api/plan/tasks', AUTH_SECRET));
    expect(res.status).toBe(400);
  });

  it('returns empty tasks list when member has no plan tasks', async () => {
    const res = await GET(req(`http://localhost/api/plan/tasks?userId=${FELIX_ID}`, AUTH_SECRET));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.tasks).toEqual([]);
    expect(json.count).toBe(0);
  });

  it('returns only tasks with phase set', async () => {
    getIssuesForUserMock.mockResolvedValue([
      { id: 'i-1', title: 'Plan Task', identifier: 'KAL-10', priority: 2, dueDate: null,
        state: { name: 'In Progress', type: 'started' } },
      { id: 'i-2', title: 'Regular Task', identifier: 'KAL-11', priority: 3, dueDate: null,
        state: { name: 'Todo', type: 'unstarted' } },
    ]);
    getTaskMetaByIssueIdsMock.mockResolvedValue({
      'i-1': { phase: 1, bereich: 'angebot', context: null, effortMinutes: null,
               important: false, urgent: false, energy: null, projectId: null, fixed: false },
    });

    const res = await GET(req(`http://localhost/api/plan/tasks?userId=${FELIX_ID}`, AUTH_SECRET));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.count).toBe(1);
    expect(json.tasks[0].id).toBe('i-1');
    expect(json.tasks[0].phase).toBe(1);
    expect(json.tasks[0].status).toBe('in_progress');
  });

  it('filters by phase when provided', async () => {
    getIssuesForUserMock.mockResolvedValue([
      { id: 'i-1', title: 'Phase 1 Task', identifier: 'KAL-10', priority: 2, dueDate: null,
        state: { name: 'Todo', type: 'unstarted' } },
      { id: 'i-2', title: 'Phase 2 Task', identifier: 'KAL-11', priority: 2, dueDate: null,
        state: { name: 'Todo', type: 'unstarted' } },
    ]);
    getTaskMetaByIssueIdsMock.mockResolvedValue({
      'i-1': { phase: 1, bereich: 'angebot', context: null, effortMinutes: null,
               important: false, urgent: false, energy: null, projectId: null, fixed: false },
      'i-2': { phase: 2, bereich: 'planung', context: null, effortMinutes: null,
               important: false, urgent: false, energy: null, projectId: null, fixed: false },
    });

    const res = await GET(req(`http://localhost/api/plan/tasks?userId=${FELIX_ID}&phase=1`, AUTH_SECRET));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.count).toBe(1);
    expect(json.tasks[0].id).toBe('i-1');
  });

  it('tenant isolation: member cannot read another member plan', async () => {
    process.env.TEAM_OS_AUTH_SECRET = AUTH_SECRET;
    delete process.env.DASHBOARD_API_SECRET;
    const cookie = await signAuthCookie(undefined, Math.floor(Date.now() / 1000), FELIX_ID);
    const cookieReq = new NextRequest(
      `http://localhost/api/plan/tasks?userId=other-member-id`,
      { headers: { cookie: `${AUTH_COOKIE_NAME}=${cookie}` } },
    );
    const res = await GET(cookieReq);
    expect(res.status).toBe(403);
    process.env.DASHBOARD_API_SECRET = AUTH_SECRET;
    delete process.env.TEAM_OS_AUTH_SECRET;
  });
});

describe('PATCH /api/plan/tasks/:id', () => {
  const ISSUE_ID = 'issue-abc';
  const FELIX_ID = 'c9677ade-e42c-4593-81c6-7a2108b145fd';
  const AUTH_SECRET = 'test-auth-secret-with-enough-bytes';

  function patchReq(id: string, body: unknown): import('next/server').NextRequest {
    const { NextRequest } = require('next/server');
    return new NextRequest(`http://localhost/api/plan/tasks/${id}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${AUTH_SECRET}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  beforeEach(() => {
    process.env.DASHBOARD_API_SECRET = AUTH_SECRET;
    getTaskMetaByIssueIdsMock.mockResolvedValue({
      [ISSUE_ID]: {
        phase: 1, bereich: 'angebot', context: null, effortMinutes: null,
        important: false, urgent: false, energy: null, projectId: null, fixed: false,
        workerIds: [],
      },
    });
    upsertTaskMetaMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.DASHBOARD_API_SECRET;
    vi.clearAllMocks();
  });

  it('PATCH with only workerIds persists them', async () => {
    const req = patchReq(ISSUE_ID, { workerIds: [FELIX_ID], userId: FELIX_ID });
    const res = await PATCH(req, { params: Promise.resolve({ id: ISSUE_ID }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);

    expect(upsertTaskMetaMock).toHaveBeenCalledOnce();
    const [, , meta] = upsertTaskMetaMock.mock.calls[0];
    expect(meta.workerIds).toEqual([FELIX_ID]);
  });

  it('PATCH with phase + bereich + workerIds together all persist', async () => {
    const req = patchReq(ISSUE_ID, { phase: 2, bereich: 'planung', workerIds: [FELIX_ID], userId: FELIX_ID });
    const res = await PATCH(req, { params: Promise.resolve({ id: ISSUE_ID }) });
    expect(res.status).toBe(200);

    expect(upsertTaskMetaMock).toHaveBeenCalledOnce();
    const [, , meta] = upsertTaskMetaMock.mock.calls[0];
    expect(meta.phase).toBe(2);
    expect(meta.bereich).toBe('planung');
    expect(meta.workerIds).toEqual([FELIX_ID]);
  });

  it('PATCH with empty workerIds removes workers', async () => {
    getTaskMetaByIssueIdsMock.mockResolvedValue({
      [ISSUE_ID]: {
        phase: 1, bereich: 'angebot', context: null, effortMinutes: null,
        important: false, urgent: false, energy: null, projectId: null, fixed: false,
        workerIds: [FELIX_ID],
      },
    });

    const req = patchReq(ISSUE_ID, { workerIds: [], userId: FELIX_ID });
    const res = await PATCH(req, { params: Promise.resolve({ id: ISSUE_ID }) });
    expect(res.status).toBe(200);

    const [, , meta] = upsertTaskMetaMock.mock.calls[0];
    expect(meta.workerIds).toEqual([]);
  });

  it('PATCH without workerIds preserves existing ones (no regression)', async () => {
    getTaskMetaByIssueIdsMock.mockResolvedValue({
      [ISSUE_ID]: {
        phase: 1, bereich: 'angebot', context: null, effortMinutes: null,
        important: false, urgent: false, energy: null, projectId: null, fixed: false,
        workerIds: [FELIX_ID],
      },
    });

    const req = patchReq(ISSUE_ID, { phase: 3, userId: FELIX_ID });
    const res = await PATCH(req, { params: Promise.resolve({ id: ISSUE_ID }) });
    expect(res.status).toBe(200);

    const [, , meta] = upsertTaskMetaMock.mock.calls[0];
    expect(meta.phase).toBe(3);
    expect(meta.workerIds).toEqual([FELIX_ID]);
  });
});

describe('GET /api/plan/tasks — workerIds serialized', () => {
  const AUTH_SECRET = 'test-auth-secret-with-enough-bytes';
  const FELIX_ID = 'c9677ade-e42c-4593-81c6-7a2108b145fd';
  const LINEAR_USER_ID = 'linear-user-felix';

  function req(url: string): import('next/server').NextRequest {
    const { NextRequest } = require('next/server');
    return new NextRequest(url, { headers: { authorization: `Bearer ${AUTH_SECRET}` } });
  }

  beforeEach(() => {
    process.env.DASHBOARD_API_SECRET = AUTH_SECRET;
    supabaseSingle.mockResolvedValue({
      data: { id: FELIX_ID, linear_user_id: LINEAR_USER_ID },
      error: null,
    });
    getIssuesForUserMock.mockResolvedValue([
      { id: 'i-w1', title: 'Task with worker', identifier: 'KAL-20', priority: 2, dueDate: null,
        state: { name: 'Todo', type: 'unstarted' } },
    ]);
    getTaskMetaByIssueIdsMock.mockResolvedValue({
      'i-w1': {
        phase: 1, bereich: 'angebot', context: null, effortMinutes: null,
        important: false, urgent: false, energy: null, projectId: null, fixed: false,
        workerIds: [FELIX_ID],
      },
    });
  });

  afterEach(() => {
    delete process.env.DASHBOARD_API_SECRET;
    vi.clearAllMocks();
  });

  it('GET returns workerIds from meta', async () => {
    const res = await GET(req(`http://localhost/api/plan/tasks?userId=${FELIX_ID}`));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.tasks[0].workerIds).toEqual([FELIX_ID]);
  });

  it('GET returns empty workerIds when not set', async () => {
    getTaskMetaByIssueIdsMock.mockResolvedValue({
      'i-w1': {
        phase: 1, bereich: 'angebot', context: null, effortMinutes: null,
        important: false, urgent: false, energy: null, projectId: null, fixed: false,
        workerIds: [],
      },
    });
    const res = await GET(req(`http://localhost/api/plan/tasks?userId=${FELIX_ID}`));
    const json = await res.json();
    expect(json.tasks[0].workerIds).toEqual([]);
  });
});
