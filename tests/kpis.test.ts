import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests für `lib/kpis.ts` — direkter Coverage.
 *
 * Mock-Strategie: Per-Test eine Queue von Response-Werten. `from(...)` liefert
 * einen thenable Proxy, der alle Builder-Methoden (`select/eq/order/...`)
 * chainable durchreicht und beim `await` die nächste Antwort aus der Queue
 * konsumiert. Damit ist die Reihenfolge der Supabase-Calls innerhalb einer
 * Funktion exakt abbildbar.
 */

type Resp = { data?: unknown; error?: unknown };

const responses: Resp[] = [];
const fromCalls: string[] = [];
const updatePayloads: Record<string, unknown>[] = [];
const insertPayloads: Record<string, unknown>[] = [];
const upsertPayloads: Record<string, unknown>[] = [];
const eqCalls: Array<[string, unknown]> = [];

function nextResponse(): Promise<Resp> {
  const r = responses.shift();
  if (!r) return Promise.resolve({ data: null, error: null });
  return Promise.resolve(r);
}

function makeBuilder(): unknown {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const m of ['select', 'order', 'gte', 'in', 'limit']) builder[m] = vi.fn(chain);
  builder.eq = vi.fn((col: string, val: unknown) => {
    eqCalls.push([col, val]);
    return builder;
  });
  builder.update = vi.fn((payload: Record<string, unknown>) => {
    updatePayloads.push(payload);
    return builder;
  });
  builder.insert = vi.fn((payload: Record<string, unknown>) => {
    insertPayloads.push(payload);
    return builder;
  });
  builder.upsert = vi.fn((payload: Record<string, unknown>) => {
    upsertPayloads.push(payload);
    return builder;
  });
  builder.delete = vi.fn(() => builder);
  builder.single = vi.fn(() => nextResponse());
  builder.maybeSingle = vi.fn(() => nextResponse());
  // thenable: await builder → nextResponse()
  builder.then = (onFulfilled: (v: Resp) => unknown, onRejected?: (e: unknown) => unknown) =>
    nextResponse().then(onFulfilled, onRejected);
  return builder;
}

const fromMock = vi.fn((table: string) => {
  fromCalls.push(table);
  return makeBuilder();
});

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...(args as [string])) },
}));

const getCallsThisWeekMock = vi.fn(async () => [] as unknown[]);
vi.mock('@/lib/hubspot', () => ({
  getCallsThisWeek: (ownerId: string) => getCallsThisWeekMock(ownerId),
}));

import {
  createKpi,
  adjustKpiActual,
  updateKpiDefinition,
  deleteKpi,
  listUserKpis,
  getRecentlyCompletedSteps,
  getRecentCounterActivity,
  resolveActualFromSource,
} from '@/lib/kpis';

const USER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const KPI_ID = '11111111-2222-3333-4444-555555555555';
const WEEK = '2026-05-11';

beforeEach(() => {
  responses.length = 0;
  fromCalls.length = 0;
  updatePayloads.length = 0;
  insertPayloads.length = 0;
  upsertPayloads.length = 0;
  eqCalls.length = 0;
  fromMock.mockClear();
  getCallsThisWeekMock.mockClear();
  getCallsThisWeekMock.mockImplementation(async () => []);
});

describe('createKpi', () => {
  it('inserts a counter and a kpi_weeks row', async () => {
    responses.push(
      { data: { position: 2 } }, // 1. max-position lookup
      {
        data: {
          id: KPI_ID, user_id: USER, parent_id: null, name: 'Calls', unit: 'Anrufe',
          position: 3, type: 'counter', due_date: null, completed: false, created_at: 'x',
        },
        error: null,
      }, // 2. insert kpis → single()
      { error: null }, // 3. insert kpi_weeks
    );

    const result = await createKpi({
      user_id: USER, name: 'Calls', unit: 'Anrufe', target: 30,
      week_start: WEEK, type: 'counter',
    });

    expect(result.id).toBe(KPI_ID);
    expect(result.target).toBe(30);
    expect(result.actual).toBe(0);
    expect(fromCalls).toEqual(['kpis', 'kpis', 'kpi_weeks']);
  });

  it('does not write kpi_weeks for projects', async () => {
    responses.push(
      { data: null }, // max-position
      {
        data: { id: KPI_ID, type: 'project', user_id: USER, parent_id: null, name: 'P', unit: '', position: 0, due_date: '2026-06-01', completed: false, created_at: 'x' },
        error: null,
      },
    );

    await createKpi({ user_id: USER, name: 'P', week_start: WEEK, type: 'project', due_date: '2026-06-01' });

    expect(fromCalls).not.toContain('kpi_weeks');
  });
});

describe('adjustKpiActual', () => {
  it('increments existing actual and upserts both kpi_weeks and kpi_history', async () => {
    responses.push(
      { data: { target: 10, actual: 4 } }, // maybeSingle read
      { error: null }, // upsert kpi_weeks
      { error: null }, // upsert kpi_history
    );

    const out = await adjustKpiActual(KPI_ID, WEEK, 3);

    expect(out).toEqual({ target: 10, actual: 7 });
    expect(fromCalls).toContain('kpi_weeks');
    expect(fromCalls).toContain('kpi_history');
  });

  it('clamps negative deltas to floor 0', async () => {
    responses.push(
      { data: { target: 5, actual: 2 } },
      { error: null },
      { error: null },
    );

    const out = await adjustKpiActual(KPI_ID, WEEK, -10);
    expect(out.actual).toBe(0);
  });

  it('survives missing kpi_history table (silent skip)', async () => {
    responses.push(
      { data: { target: 5, actual: 1 } },
      { error: null }, // kpi_weeks ok
      { error: new Error('relation kpi_history does not exist') }, // kpi_history fails
    );

    const out = await adjustKpiActual(KPI_ID, WEEK, 1);
    expect(out.actual).toBe(2);
  });
});

describe('updateKpiDefinition', () => {
  it('mirrors completed=true into completed_at', async () => {
    responses.push({ error: null });
    await updateKpiDefinition(KPI_ID, { completed: true });

    const payload = updatePayloads[0];
    expect(payload.completed).toBe(true);
    expect(typeof payload.completed_at).toBe('string');
  });

  it('clears completed_at when completed=false', async () => {
    responses.push({ error: null });
    await updateKpiDefinition(KPI_ID, { completed: false });

    expect(updatePayloads[0].completed_at).toBeNull();
  });

  it('passes through other patch fields unchanged', async () => {
    responses.push({ error: null });
    await updateKpiDefinition(KPI_ID, { name: 'Renamed', due_date: '2026-06-30' });

    expect(updatePayloads[0].name).toBe('Renamed');
    expect(updatePayloads[0].due_date).toBe('2026-06-30');
    expect('completed_at' in updatePayloads[0]).toBe(false);
  });
});

describe('deleteKpi', () => {
  it('issues delete on kpis by id', async () => {
    responses.push({ error: null });
    await deleteKpi(KPI_ID);

    expect(fromCalls).toEqual(['kpis']);
    expect(eqCalls).toContainEqual(['id', KPI_ID]);
  });
});

describe('listUserKpis', () => {
  it('returns empty list when no definitions', async () => {
    responses.push({ data: [], error: null });

    const out = await listUserKpis(USER, WEEK);
    expect(out).toEqual([]);
  });

  it('merges kpi_weeks target/actual onto counters', async () => {
    responses.push(
      {
        data: [
          { id: KPI_ID, user_id: USER, parent_id: null, name: 'Calls', unit: 'Anrufe', position: 0, type: 'counter', due_date: null, completed: false, created_at: 'x', source: 'manual' },
        ],
        error: null,
      }, // definitions
      { data: [{ kpi_id: KPI_ID, target: 30, actual: 12 }], error: null }, // kpi_weeks
      { data: [], error: null }, // kpi_history (via getKpiHistory)
    );

    const out = await listUserKpis(USER, WEEK);
    expect(out).toHaveLength(1);
    expect(out[0].target).toBe(30);
    expect(out[0].actual).toBe(12);
  });

  it('overrides actual from HubSpot for auto-sourced counter', async () => {
    getCallsThisWeekMock.mockResolvedValueOnce([
      { id: 'c1' }, { id: 'c2' }, { id: 'c3' }, { id: 'c4' }, { id: 'c5' },
    ]);
    responses.push(
      {
        data: [
          { id: KPI_ID, user_id: USER, parent_id: null, name: 'Cold Calls', unit: 'Anrufe', position: 0, type: 'counter', due_date: null, completed: false, created_at: 'x', source: 'hubspot:calls-week' },
        ],
        error: null,
      }, // definitions
      { data: [{ kpi_id: KPI_ID, target: 30, actual: 99 }], error: null }, // kpi_weeks (ignored for actual)
      { data: [], error: null }, // kpi_history
      { data: { id: USER, hubspot_owner_id: 'hs-paul-id', role: 'sales' }, error: null }, // team_members.single
    );

    const out = await listUserKpis(USER, WEEK);
    expect(out).toHaveLength(1);
    expect(out[0].target).toBe(30);
    expect(out[0].actual).toBe(5);
    expect(out[0].history).toBeUndefined();
    expect(getCallsThisWeekMock).toHaveBeenCalledWith('hs-paul-id');
  });

  it('auto-counter returns 0 if member has no hubspot_owner_id', async () => {
    responses.push(
      {
        data: [
          { id: KPI_ID, user_id: USER, parent_id: null, name: 'Cold Calls', unit: 'Anrufe', position: 0, type: 'counter', due_date: null, completed: false, created_at: 'x', source: 'hubspot:calls-week' },
        ],
        error: null,
      },
      { data: [{ kpi_id: KPI_ID, target: 30, actual: 99 }], error: null },
      { data: [], error: null },
      { data: { id: USER, hubspot_owner_id: null, role: 'sales' }, error: null },
    );

    const out = await listUserKpis(USER, WEEK);
    expect(out[0].actual).toBe(0);
    expect(getCallsThisWeekMock).not.toHaveBeenCalled();
  });
});

describe('resolveActualFromSource', () => {
  const SALES_MEMBER = {
    id: USER,
    name: 'Paul',
    email: 'p@x.de',
    role: 'sales' as const,
    telegram_chat_id: null,
    linear_user_id: null,
    github_username: null,
    hubspot_owner_id: 'hs-paul-id',
    google_calendar_id: null,
    google_refresh_token: null,
    google_calendar_email: null,
    notion_user_id: null,
  };

  it("returns 0 for 'manual' source", async () => {
    const out = await resolveActualFromSource('manual', SALES_MEMBER);
    expect(out).toBe(0);
    expect(getCallsThisWeekMock).not.toHaveBeenCalled();
  });

  it("returns calls.length for 'hubspot:calls-week'", async () => {
    getCallsThisWeekMock.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    const out = await resolveActualFromSource('hubspot:calls-week', SALES_MEMBER);
    expect(out).toBe(3);
    expect(getCallsThisWeekMock).toHaveBeenCalledWith('hs-paul-id');
  });

  it('returns 0 when member has no hubspot_owner_id', async () => {
    const out = await resolveActualFromSource('hubspot:calls-week', { ...SALES_MEMBER, hubspot_owner_id: null });
    expect(out).toBe(0);
    expect(getCallsThisWeekMock).not.toHaveBeenCalled();
  });

  it('returns 0 fail-soft when HubSpot throws', async () => {
    getCallsThisWeekMock.mockRejectedValueOnce(new Error('HubSpot 500'));
    const out = await resolveActualFromSource('hubspot:calls-week', SALES_MEMBER);
    expect(out).toBe(0);
  });

  it('returns 0 when member is null', async () => {
    const out = await resolveActualFromSource('hubspot:calls-week', null);
    expect(out).toBe(0);
    expect(getCallsThisWeekMock).not.toHaveBeenCalled();
  });
});

describe('getRecentlyCompletedSteps', () => {
  it('returns empty when no steps completed', async () => {
    responses.push({ data: [], error: null });
    const out = await getRecentlyCompletedSteps(USER, '2026-05-10T00:00:00Z');
    expect(out).toEqual([]);
  });

  it('joins parent names when steps have parent_id', async () => {
    responses.push(
      {
        data: [
          { id: 'step-1', name: 'Heap-Dump', completed_at: '2026-05-11T10:00:00Z', parent_id: 'proj-1' },
        ],
        error: null,
      },
      { data: [{ id: 'proj-1', name: 'Email-OOM-Fix' }], error: null },
    );

    const out = await getRecentlyCompletedSteps(USER, '2026-05-10T00:00:00Z');
    expect(out).toHaveLength(1);
    expect(out[0].parent_name).toBe('Email-OOM-Fix');
    expect(out[0].name).toBe('Heap-Dump');
  });
});

describe('getRecentCounterActivity', () => {
  it('returns empty when no counters defined', async () => {
    responses.push({ data: [], error: null });
    const out = await getRecentCounterActivity(USER, '2026-05-11');
    expect(out).toEqual([]);
  });

  it('computes day-over-day delta from kpi_history', async () => {
    responses.push(
      { data: [{ id: KPI_ID, name: 'Calls', unit: 'Anrufe' }], error: null },
      {
        data: [
          { kpi_id: KPI_ID, day: '2026-05-10', actual: 2 },
          { kpi_id: KPI_ID, day: '2026-05-11', actual: 5 },
          { kpi_id: KPI_ID, day: '2026-05-12', actual: 7 },
        ],
        error: null,
      },
    );

    const out = await getRecentCounterActivity(USER, '2026-05-11');
    expect(out).toHaveLength(2);
    const byDay = Object.fromEntries(out.map((c) => [c.day, c.delta]));
    expect(byDay['2026-05-11']).toBe(3);
    expect(byDay['2026-05-12']).toBe(2);
  });

  it('treats first-recorded day as full delta from 0', async () => {
    responses.push(
      { data: [{ id: KPI_ID, name: 'New KPI', unit: '' }], error: null },
      { data: [{ kpi_id: KPI_ID, day: '2026-05-12', actual: 4 }], error: null },
    );

    const out = await getRecentCounterActivity(USER, '2026-05-12');
    expect(out).toHaveLength(1);
    expect(out[0].delta).toBe(4);
  });

  it('drops days with zero or negative delta', async () => {
    responses.push(
      { data: [{ id: KPI_ID, name: 'X', unit: '' }], error: null },
      {
        data: [
          { kpi_id: KPI_ID, day: '2026-05-11', actual: 5 },
          { kpi_id: KPI_ID, day: '2026-05-12', actual: 5 },
          { kpi_id: KPI_ID, day: '2026-05-13', actual: 3 },
        ],
        error: null,
      },
    );

    const out = await getRecentCounterActivity(USER, '2026-05-11');
    expect(out.map((c) => c.day)).toEqual(['2026-05-11']);
  });
});
