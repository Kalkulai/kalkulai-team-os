import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const SECRET = 'unit-test-secret';

// --- Mocks: keine echten Sheets-Calls, kein echter Sync ---
const loadSheetMapMock = vi.fn();
const readNamedRangeMock = vi.fn();
const writeNamedRangeMock = vi.fn();
const runFinanceSyncMock = vi.fn();

vi.mock('@/lib/google-sheets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/google-sheets')>();
  return {
    ...actual, // Typen (FieldSpec/SheetMap) bleiben echt
    loadSheetMap: (...args: unknown[]) => loadSheetMapMock(...args),
    readNamedRange: (...args: unknown[]) => readNamedRangeMock(...args),
    writeNamedRange: (...args: unknown[]) => writeNamedRangeMock(...args),
  };
});

vi.mock('@/lib/finance-sync', () => ({
  runFinanceSync: (...args: unknown[]) => runFinanceSyncMock(...args),
}));

import { POST as plan } from '@/app/api/finance/plan/route';
import type { SheetMap } from '@/lib/google-sheets';

function planMap(): SheetMap {
  return {
    sheets: { finanzplan: 'fp-id', guv: 'guv-id' },
    fields: {
      price_per_pilot: { sheet: 'finanzplan', namedRange: 'price_per_pilot', kind: 'input' },
      'monthly_burn.plan_eur': { sheet: 'finanzplan', namedRange: 'burn_plan', kind: 'input' },
      cash_on_hand_eur: { sheet: 'guv', namedRange: 'cash_on_hand', kind: 'output' },
    },
  };
}

function request(body: unknown, url = 'http://localhost/api/finance/plan'): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: new Headers({
      authorization: `Bearer ${SECRET}`,
      'content-type': 'application/json',
    }),
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.DASHBOARD_API_SECRET = SECRET;
  loadSheetMapMock.mockReset();
  readNamedRangeMock.mockReset();
  writeNamedRangeMock.mockReset();
  runFinanceSyncMock.mockReset();
  loadSheetMapMock.mockReturnValue(planMap());
  readNamedRangeMock.mockResolvedValue([['900']]);
  writeNamedRangeMock.mockResolvedValue(undefined);
  runFinanceSyncMock.mockResolvedValue({ ok: true, id: 'snap-1', data: {} });
});

describe('POST /api/finance/plan — auth', () => {
  it('401 ohne Bearer-Token, kein Write', async () => {
    const res = await plan(
      new NextRequest('http://localhost/api/finance/plan', {
        method: 'POST',
        headers: new Headers({ 'content-type': 'application/json' }),
        body: JSON.stringify({ intent: 'x', edits: [{ field: 'price_per_pilot', value: 1 }] }),
      }),
    );
    expect(res.status).toBe(401);
    expect(writeNamedRangeMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/finance/plan — dry-run', () => {
  it('(a) liefert Diff, schreibt NICHT', async () => {
    readNamedRangeMock.mockResolvedValue([['900,00 €']]);
    const res = await plan(
      request({
        intent: 'Pilotpreis anheben',
        edits: [{ field: 'price_per_pilot', value: 1200 }],
        dryRun: true,
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.dryRun).toBe(true);
    expect(json.diff).toEqual([
      {
        field: 'price_per_pilot',
        namedRange: 'price_per_pilot',
        sheet: 'finanzplan',
        old: '900,00 €',
        new: 1200,
      },
    ]);
    expect(writeNamedRangeMock).not.toHaveBeenCalled();
    expect(runFinanceSyncMock).not.toHaveBeenCalled();
  });

  it('dryRun auch via Query-Param ?dryRun=1', async () => {
    const res = await plan(
      request(
        { intent: 'Burn planen', edits: [{ field: 'monthly_burn.plan_eur', value: 1500 }] },
        'http://localhost/api/finance/plan?dryRun=1',
      ),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.dryRun).toBe(true);
    expect(json.diff).toEqual([
      {
        field: 'monthly_burn.plan_eur',
        namedRange: 'burn_plan',
        sheet: 'finanzplan',
        old: '900',
        new: 1500,
      },
    ]);
    expect(writeNamedRangeMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/finance/plan — Allow-List', () => {
  it('(b) edit auf output-Feld → 400, kein Write', async () => {
    const res = await plan(
      request({ intent: 'x', edits: [{ field: 'cash_on_hand_eur', value: 5000 }] }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/kein Input/);
    expect(writeNamedRangeMock).not.toHaveBeenCalled();
    expect(runFinanceSyncMock).not.toHaveBeenCalled();
  });

  it('(c) unbekanntes Feld → 400, kein Write', async () => {
    const res = await plan(
      request({ intent: 'x', edits: [{ field: 'does_not_exist', value: 1 }] }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/nicht in Sheet-Map/);
    expect(writeNamedRangeMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/finance/plan — apply', () => {
  it('(d) input-Feld → writeNamedRange korrekt + runFinanceSync danach', async () => {
    const res = await plan(
      request({
        intent: 'Pilotpreis + Burn anpassen',
        edits: [
          { field: 'price_per_pilot', value: 1200 },
          { field: 'monthly_burn.plan_eur', value: 2800 },
        ],
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.sync).toEqual({ ok: true, id: 'snap-1' });

    expect(writeNamedRangeMock).toHaveBeenCalledTimes(2);
    expect(writeNamedRangeMock).toHaveBeenNthCalledWith(1, 'fp-id', 'price_per_pilot', [[1200]]);
    expect(writeNamedRangeMock).toHaveBeenNthCalledWith(2, 'fp-id', 'burn_plan', [[2800]]);

    expect(runFinanceSyncMock).toHaveBeenCalledOnce();
    expect(json.applied).toHaveLength(2);
  });

  it('Schreibfehler → 502 mit konkretem Feld, kein Sync', async () => {
    writeNamedRangeMock.mockRejectedValueOnce(new Error('quota exceeded'));
    const res = await plan(
      request({ intent: 'x', edits: [{ field: 'price_per_pilot', value: 1200 }] }),
    );
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/price_per_pilot/);
    expect(runFinanceSyncMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/finance/plan — Body-Validierung', () => {
  it('(e) leere edits → 400, kein Write', async () => {
    const res = await plan(request({ intent: 'x', edits: [] }));
    expect(res.status).toBe(400);
    expect(writeNamedRangeMock).not.toHaveBeenCalled();
  });

  it('(e) value NaN → 400, kein Write', async () => {
    const res = await plan(
      request({ intent: 'x', edits: [{ field: 'price_per_pilot', value: Number.NaN }] }),
    );
    // NaN serialisiert zu null im JSON → schlägt am number-Check fehl.
    expect(res.status).toBe(400);
    expect(writeNamedRangeMock).not.toHaveBeenCalled();
  });

  it('fehlender intent → 400', async () => {
    const res = await plan(request({ edits: [{ field: 'price_per_pilot', value: 1 }] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/intent/);
  });
});
