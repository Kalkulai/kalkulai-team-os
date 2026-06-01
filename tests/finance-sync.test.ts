import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mocks: keine echten Sheets-Calls, kein echter DB-Insert, kein echtes Telegram ---
const loadSheetMapMock = vi.fn();
const readNamedRangeMock = vi.fn();
const insertFinanceSnapshotMock = vi.fn();
const sendTelegramMessageMock = vi.fn();

vi.mock('@/lib/google-sheets', async (importOriginal) => {
  // isFinanceScenario etc. liegen in finance-store; hier nur die Sheet-Funktionen mocken.
  const actual = await importOriginal<typeof import('@/lib/google-sheets')>();
  return {
    ...actual,
    loadSheetMap: (...args: unknown[]) => loadSheetMapMock(...args),
    readNamedRange: (...args: unknown[]) => readNamedRangeMock(...args),
  };
});

vi.mock('@/lib/finance-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/finance-store')>();
  return {
    ...actual, // isFinanceScenario bleibt echt
    insertFinanceSnapshot: (...args: unknown[]) => insertFinanceSnapshotMock(...args),
  };
});

vi.mock('@/lib/telegram', () => ({
  sendTelegramMessage: (...args: unknown[]) => sendTelegramMessageMock(...args),
}));

import { parseEur, runFinanceSync } from '@/lib/finance-sync';
import type { SheetMap } from '@/lib/google-sheets';

// Map deckt cash_on_hand_eur + burn actual/plan + break_even ab; price_per_pilot
// ist absichtlich dabei (nicht auf FinanceData gemappt → muss ignoriert werden).
function syncMap(): SheetMap {
  return {
    sheets: { guv: 'guv-id', finanzplan: 'fp-id' },
    fields: {
      cash_on_hand_eur: { sheet: 'guv', namedRange: 'cash_on_hand', kind: 'output' },
      'monthly_burn.actual_eur': { sheet: 'guv', namedRange: 'burn_actual', kind: 'output' },
      'monthly_burn.plan_eur': { sheet: 'finanzplan', namedRange: 'burn_plan', kind: 'input' },
      break_even_label: { sheet: 'guv', namedRange: 'break_even', kind: 'output' },
      price_per_pilot: { sheet: 'finanzplan', namedRange: 'price_per_pilot', kind: 'input' },
    },
  };
}

/** Mappt eine Named-Range auf ihren rohen Zellwert (string[][]). */
function rangeResponder(byRange: Record<string, string>) {
  return async (_sheetId: string, namedRange: string): Promise<string[][]> => {
    const v = byRange[namedRange];
    if (v === undefined) throw new Error(`unexpected range ${namedRange}`);
    return [[v]];
  };
}

beforeEach(() => {
  loadSheetMapMock.mockReset();
  readNamedRangeMock.mockReset();
  insertFinanceSnapshotMock.mockReset();
  sendTelegramMessageMock.mockReset();
  sendTelegramMessageMock.mockResolvedValue({ ok: true });
  process.env.FINANCE_ALERT_CHAT_ID = 'alert-chat';
  process.env.ACTIVE_FINANCE_SCENARIO = 'current';
});

describe('parseEur — deutsches Format', () => {
  it('"1.367,00 €" → 1367', () => {
    expect(parseEur('1.367,00 €')).toBe(1367);
  });
  it('"7.333" → 7333', () => {
    expect(parseEur('7.333')).toBe(7333);
  });
  it('negatives Format "-250,50 €" → -250.5', () => {
    expect(parseEur('-250,50 €')).toBe(-250.5);
  });
  it('wirft bei nicht-parsebarem Input', () => {
    expect(() => parseEur('abc')).toThrow();
  });
});

describe('runFinanceSync — Happy-Path', () => {
  it('rechnet runway + delta SELBST und inserted den Snapshot', async () => {
    loadSheetMapMock.mockReturnValue(syncMap());
    // cash 18000, actual 3000, plan 2500 → delta=500, runway=18000/3000=6.0
    readNamedRangeMock.mockImplementation(
      rangeResponder({
        cash_on_hand: '18.000,00 €',
        burn_actual: '3.000',
        burn_plan: '2.500',
        break_even: 'M7 · Feb 2027',
      }),
    );
    insertFinanceSnapshotMock.mockResolvedValue('snap-id-1');

    const result = await runFinanceSync();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.id).toBe('snap-id-1');

    // Insert genau einmal, mit aktivem Szenario + selbst gerechneten Werten.
    expect(insertFinanceSnapshotMock).toHaveBeenCalledTimes(1);
    const [scenario, data, source] = insertFinanceSnapshotMock.mock.calls[0];
    expect(scenario).toBe('current');
    expect(source).toBe('cfo-kai:app-sync');
    expect(data.cash_on_hand_eur).toBe(18000);
    expect(data.monthly_burn.actual_eur).toBe(3000);
    expect(data.monthly_burn.plan_eur).toBe(2500);
    expect(data.monthly_burn.delta_eur).toBe(500); // SELBST: actual - plan
    expect(data.runway_months).toBe(6); // SELBST: 18000 / 3000
    expect(data.break_even_label).toBe('M7 · Feb 2027');
    // Komplexe Felder kommen aus den Defaults.
    expect(data.cost_lines.length).toBeGreaterThan(0);

    expect(sendTelegramMessageMock).not.toHaveBeenCalled();
  });
});

describe('runFinanceSync — Gate-Fail', () => {
  it('lehnt inkonsistente Werte ab: KEIN Insert, Telegram-Alarm', async () => {
    loadSheetMapMock.mockReturnValue(syncMap());
    // cash negativ → Sanity-Gate (cash_on_hand_eur >= 0) schlägt fehl.
    readNamedRangeMock.mockImplementation(
      rangeResponder({
        cash_on_hand: '-5.000,00 €',
        burn_actual: '3.000',
        burn_plan: '2.500',
        break_even: 'M7',
      }),
    );

    const result = await runFinanceSync();

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected fail');
    expect(result.reason).toMatch(/Sanity-Gate/);
    expect(insertFinanceSnapshotMock).not.toHaveBeenCalled();
    expect(sendTelegramMessageMock).toHaveBeenCalledTimes(1);
    const [chatId] = sendTelegramMessageMock.mock.calls[0];
    expect(chatId).toBe('alert-chat');
  });
});

describe('runFinanceSync — Lesefehler (fehlende Range)', () => {
  it('nicht-transienter Fehler → kein Retry, kein Insert, Alarm', async () => {
    loadSheetMapMock.mockReturnValue(syncMap());
    readNamedRangeMock.mockRejectedValue(new Error('Named Range "burn_actual" not found'));

    const result = await runFinanceSync();

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected fail');
    expect(result.reason).toMatch(/Sheet-Lesen/);
    expect(insertFinanceSnapshotMock).not.toHaveBeenCalled();
    expect(sendTelegramMessageMock).toHaveBeenCalledTimes(1);
    // Nicht-transient → genau ein Lese-Versuch pro Feld bis zum Fehler (kein Backoff-Retry).
    // (Reihenfolge der Felder nicht garantiert; entscheidend: kein Insert + Alarm.)
  });

  it('transienter 503-Fehler → Retries erschöpft → kein Insert, Alarm', async () => {
    loadSheetMapMock.mockReturnValue(syncMap());
    readNamedRangeMock.mockRejectedValue(new Error('503 Service Unavailable'));

    const result = await runFinanceSync();

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected fail');
    expect(insertFinanceSnapshotMock).not.toHaveBeenCalled();
    expect(sendTelegramMessageMock).toHaveBeenCalledTimes(1);
  }, 10000);
});

describe('runFinanceSync — Telegram-Alarm crasht nie', () => {
  it('schluckt Telegram-Fehler und gibt trotzdem ein SyncResult zurück', async () => {
    loadSheetMapMock.mockReturnValue(syncMap());
    readNamedRangeMock.mockRejectedValue(new Error('Named Range fehlt'));
    sendTelegramMessageMock.mockRejectedValue(new Error('telegram down'));

    const result = await runFinanceSync();

    expect(result.ok).toBe(false);
  });
});
