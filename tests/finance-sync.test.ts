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

import { activeScenario, parseEur, runFinanceSync } from '@/lib/finance-sync';
import { checkFinanceConsistency } from '@/lib/finance-gate';
import type { SheetMap } from '@/lib/google-sheets';

const INPUT_FIELD_NAMED_RANGES = {
  churn_rate_monthly: 'cfo_input_churn_rate_monthly',
  price_full_eur: 'cfo_input_price_full_eur',
  price_pilot_eur: 'cfo_input_price_pilot_eur',
  api_cost_per_customer_eur: 'cfo_input_api_cost_per_customer_eur',
  stripe_fee_rate: 'cfo_input_stripe_fee_rate',
  pilot_start_count: 'cfo_input_pilot_start_count',
  pilot_new_per_month: 'cfo_input_pilot_new_per_month',
  pilot_conversion_rate: 'cfo_input_pilot_conversion_rate',
  stipend_m1_eur: 'cfo_input_stipend_m1_eur',
  stipend_m2plus_eur: 'cfo_input_stipend_m2plus_eur',
  ug_foundation_eur: 'cfo_input_ug_foundation_eur',
  postexist_gf_salary_eur: 'cfo_input_postexist_gf_salary_eur',
  postexist_gf_count: 'cfo_input_postexist_gf_count',
  postexist_intern_salary_eur: 'cfo_input_postexist_intern_salary_eur',
  postexist_intern_count_y2: 'cfo_input_postexist_intern_count_y2',
  cost_infrastructure_eur: 'cfo_input_cost_infrastructure_eur',
  cost_development_tools_eur: 'cfo_input_cost_development_tools_eur',
  cost_monitoring_office_eur: 'cfo_input_cost_monitoring_office_eur',
  cost_rnd_finetuning_eur: 'cfo_input_cost_rnd_finetuning_eur',
  cost_sales_tools_eur: 'cfo_input_cost_sales_tools_eur',
  cost_marketing_eur: 'cfo_input_cost_marketing_eur',
  cost_insurance_eur: 'cfo_input_cost_insurance_eur',
  cost_bank_account_eur: 'cfo_input_cost_bank_account_eur',
} as const satisfies Record<string, string>;

function inputFields(): SheetMap['fields'] {
  const fields: SheetMap['fields'] = {};
  for (const [field, namedRange] of Object.entries(INPUT_FIELD_NAMED_RANGES)) {
    fields[field] = { sheet: 'guv', namedRange, kind: 'input' };
  }
  return fields;
}

// Map enthält Outputs plus schreibbare Input-Hebel. Der Sync darf trotzdem nur
// NUMERIC_FIELDS lesen; Plan-/Delta-/Runway-/Input-Werte werden abgeleitet/ignoriert.
function syncMap(): SheetMap {
  return {
    sheets: { guv: 'guv-id', preexist: 'preexist-id' },
    fields: {
      cash_on_hand_eur: {
        sheet: 'guv',
        namedRange: 'cfo_cash_on_hand_eur',
        kind: 'output',
      },
      'monthly_burn.actual_eur': {
        sheet: 'guv',
        namedRange: 'cfo_monthly_burn_actual_eur',
        kind: 'output',
      },
      'forecast_6m.0.cash_eur': {
        sheet: 'guv',
        namedRange: 'cfo_forecast_m1_cash_eur',
        kind: 'output',
      },
      'forecast_6m.0.burn_eur': {
        sheet: 'guv',
        namedRange: 'cfo_forecast_m1_burn_eur',
        kind: 'output',
      },
      'forecast_6m.1.cash_eur': {
        sheet: 'guv',
        namedRange: 'cfo_forecast_m2_cash_eur',
        kind: 'output',
      },
      'forecast_6m.1.burn_eur': {
        sheet: 'guv',
        namedRange: 'cfo_forecast_m2_burn_eur',
        kind: 'output',
      },
      'forecast_6m.2.cash_eur': {
        sheet: 'guv',
        namedRange: 'cfo_forecast_m3_cash_eur',
        kind: 'output',
      },
      'forecast_6m.2.burn_eur': {
        sheet: 'guv',
        namedRange: 'cfo_forecast_m3_burn_eur',
        kind: 'output',
      },
      'forecast_6m.3.cash_eur': {
        sheet: 'guv',
        namedRange: 'cfo_forecast_m4_cash_eur',
        kind: 'output',
      },
      'forecast_6m.3.burn_eur': {
        sheet: 'guv',
        namedRange: 'cfo_forecast_m4_burn_eur',
        kind: 'output',
      },
      'forecast_6m.4.cash_eur': {
        sheet: 'guv',
        namedRange: 'cfo_forecast_m5_cash_eur',
        kind: 'output',
      },
      'forecast_6m.4.burn_eur': {
        sheet: 'guv',
        namedRange: 'cfo_forecast_m5_burn_eur',
        kind: 'output',
      },
      'forecast_6m.5.cash_eur': {
        sheet: 'guv',
        namedRange: 'cfo_forecast_m6_cash_eur',
        kind: 'output',
      },
      'forecast_6m.5.burn_eur': {
        sheet: 'guv',
        namedRange: 'cfo_forecast_m6_burn_eur',
        kind: 'output',
      },
      ...inputFields(),
    },
  };
}

/** Mappt eine Range auf ihre rohen Zellwerte (string[][]). */
function rangeResponder(byRange: Record<string, string | string[][]>) {
  return async (_sheetId: string, namedRange: string): Promise<string[][]> => {
    const v = byRange[namedRange];
    if (v === undefined) throw new Error(`unexpected range ${namedRange}`);
    return typeof v === 'string' ? [[v]] : v;
  };
}

beforeEach(() => {
  loadSheetMapMock.mockReset();
  readNamedRangeMock.mockReset();
  insertFinanceSnapshotMock.mockReset();
  sendTelegramMessageMock.mockReset();
  sendTelegramMessageMock.mockResolvedValue({ ok: true });
  process.env.FINANCE_ALERT_CHAT_ID = 'alert-chat';
  delete process.env.ACTIVE_FINANCE_SCENARIO;
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

describe('activeScenario', () => {
  it('wählt vor dem 2026-08-01 das current-Szenario', () => {
    expect(activeScenario(new Date('2026-07-31T21:59:59.999Z'))).toBe('current');
  });

  it('wählt ab dem 2026-08-01 das exist-Szenario', () => {
    expect(activeScenario(new Date('2026-08-01T00:00:00.000Z'))).toBe('exist');
  });

  it('lässt ACTIVE_FINANCE_SCENARIO als Override gewinnen', () => {
    process.env.ACTIVE_FINANCE_SCENARIO = 'exist';

    expect(activeScenario(new Date('2026-06-15T00:00:00.000Z'))).toBe('exist');
  });
});

describe('runFinanceSync — Happy-Path', () => {
  it('baut exist-FinanceData aus Live-Outputs und leitet Plan/Delta/Runway selbst ab', async () => {
    loadSheetMapMock.mockReturnValue(syncMap());
    readNamedRangeMock.mockImplementation(
      rangeResponder({
        cfo_cash_on_hand_eur: '7.333,00 €',
        cfo_monthly_burn_actual_eur: '1.367',
        cfo_forecast_m1_cash_eur: '7.333',
        cfo_forecast_m1_burn_eur: '1.367',
        cfo_forecast_m2_cash_eur: '16.814',
        cfo_forecast_m2_burn_eur: '819',
        cfo_forecast_m3_cash_eur: '26.293',
        cfo_forecast_m3_burn_eur: '921',
        cfo_forecast_m4_cash_eur: '35.420',
        cfo_forecast_m4_burn_eur: '1.373',
        cfo_forecast_m5_cash_eur: '44.545',
        cfo_forecast_m5_burn_eur: '1.475',
        cfo_forecast_m6_cash_eur: '54.834',
        cfo_forecast_m6_burn_eur: '4.211',
        "'GuV Finanzplan'!B23:D37": [
          ['API (Azure + Whisper)', '', '400'],
          ['Infrastruktur', '', '48'],
          ['Development Tools', '', '220'],
          ['Monitoring & Office', '', '45'],
          ['Leere Zwischenüberschrift'],
          ['Sales-Tools', '', '50'],
          ['Marketing & Vertrieb', '', '100'],
          ['', '', ''],
          ['Versicherung (IT+Cyber)', '', '80'],
          ['Geschäftskonto', '', '50'],
          ['UG Gründung', '', '300'],
          ['Legal & Beratung', '', '417'],
          ['Stripe Gebühren', '', '9'],
        ],
        "'GuV Finanzplan'!D52": 'M6 (Jan) – Business Break-Even',
      }),
    );
    insertFinanceSnapshotMock.mockResolvedValue('snap-id-1');

    const result = await runFinanceSync('exist');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.id).toBe('snap-id-1');

    // Insert genau einmal, mit aktivem Szenario + selbst gerechneten Werten.
    expect(insertFinanceSnapshotMock).toHaveBeenCalledTimes(1);
    const [scenario, data, source] = insertFinanceSnapshotMock.mock.calls[0];
    expect(scenario).toBe('exist');
    expect(source).toBe('cfo-kai:app-sync');
    expect(data.data_origin).toBe('db');
    expect(data.as_of).toBe('GuV Finanzplan · M1 Aug');
    expect(data.cash_on_hand_eur).toBe(7333);
    expect(data.monthly_burn.actual_eur).toBe(1367);
    expect(data.monthly_burn.plan_eur).toBe(1367);
    expect(data.monthly_burn.delta_eur).toBe(0);
    expect(data.runway_months).toBe(5.4);
    expect(data.break_even_label).toBe('M6 · Jan');
    expect(data.forecast_6m).toEqual([
      { month: 'Aug', cash_eur: 7333, burn_eur: 1367 },
      { month: 'Sep', cash_eur: 16814, burn_eur: 819 },
      { month: 'Okt', cash_eur: 26293, burn_eur: 921 },
      { month: 'Nov', cash_eur: 35420, burn_eur: 1373 },
      { month: 'Dez', cash_eur: 44545, burn_eur: 1475 },
      { month: 'Jan', cash_eur: 54834, burn_eur: 4211 },
    ]);
    expect(data.cost_lines).toContainEqual({
      label: 'API (Azure + Whisper)',
      amount_eur: 400,
      fixed: false,
      paid_by: 'Company',
    });
    expect(data.paid_by).toEqual([{ name: 'Company', value_eur: 1719 }]);
    expect(data.pilot_health).toEqual([{ name: '13 Piloten', status: 'green', note: '' }]);

    expect(sendTelegramMessageMock).not.toHaveBeenCalled();
  });

  it('baut current-FinanceData aus dem Pre-EXIST-Sheet und passiert das Gate', async () => {
    loadSheetMapMock.mockReturnValue(syncMap());
    readNamedRangeMock.mockImplementation(
      rangeResponder({
        "'Übersicht'!C8:D10": [
          ['389,00 €', '389,00 €'],
          ['412,00 €', '0,00 €'],
          ['450,00 €', ''],
        ],
        "'Übersicht'!G8:I11": [
          ['Claude', '', '210,00 €'],
          ['Hosting', '', '49,00 €'],
          ['Workspace', '', '90,00 €'],
          ['OpenAI', '', '40,00 €'],
        ],
        "'Übersicht'!B16:C18": [
          ['Paul', '150,00 €'],
          ['Felix', '199,00 €'],
          ['Leon', '40,00 €'],
        ],
      }),
    );
    insertFinanceSnapshotMock.mockResolvedValue('snap-current-1');

    const result = await runFinanceSync('current', new Date('2026-06-20T12:00:00.000Z'));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    const [scenario, data] = insertFinanceSnapshotMock.mock.calls[0];
    expect(scenario).toBe('current');
    expect(data.data_origin).toBe('db');
    expect(data.as_of).toBe('Pre-EXIST · Übersicht · Jun');
    expect(data.cash_on_hand_eur).toBe(0);
    expect(data.runway_months).toBe(0);
    expect(data.break_even_label).toBe('M6 · Jan');
    expect(data.monthly_burn).toEqual({
      actual_eur: 389,
      plan_eur: 389,
      delta_eur: 0,
    });
    expect(data.cost_lines).toEqual([
      { label: 'Claude', amount_eur: 210, fixed: false, paid_by: 'Company' },
      { label: 'Hosting', amount_eur: 49, fixed: false, paid_by: 'Company' },
      { label: 'Workspace', amount_eur: 90, fixed: false, paid_by: 'Company' },
      { label: 'OpenAI', amount_eur: 40, fixed: false, paid_by: 'Company' },
    ]);
    expect(data.paid_by).toEqual([
      { name: 'Paul', value_eur: 150 },
      { name: 'Felix', value_eur: 199 },
      { name: 'Leon', value_eur: 40 },
    ]);
    expect(data.forecast_6m).toEqual([
      { month: 'Jun', cash_eur: 0, burn_eur: 389 },
      { month: 'Jul', cash_eur: 0, burn_eur: 412 },
      { month: 'Aug', cash_eur: 0, burn_eur: 450 },
    ]);
    expect(data.pilot_health).toEqual([
      { name: 'Pre-EXIST (Bootstrap)', status: 'green', note: 'EXIST-Förderung ab Aug' },
    ]);
    expect(checkFinanceConsistency(data)).toEqual({ ok: true });
    expect(sendTelegramMessageMock).not.toHaveBeenCalled();
  });

  it('nutzt beim current-Forecast Ist-Werte und fällt bei Ist 0 oder leer auf Plan zurück', async () => {
    loadSheetMapMock.mockReturnValue(syncMap());
    readNamedRangeMock.mockImplementation(
      rangeResponder({
        "'Übersicht'!C8:D10": [
          ['389,00 €', '389,00 €'],
          ['412,00 €', '0,00 €'],
          ['450,00 €', ''],
        ],
        "'Übersicht'!G8:I11": [['Claude', '', '210,00 €']],
        "'Übersicht'!B16:C18": [['Felix', '210,00 €']],
      }),
    );
    insertFinanceSnapshotMock.mockResolvedValue('snap-current-2');

    const result = await runFinanceSync('current', new Date('2026-07-03T00:00:00.000Z'));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    const [, data] = insertFinanceSnapshotMock.mock.calls[0];
    expect(data.monthly_burn).toEqual({
      actual_eur: 412,
      plan_eur: 412,
      delta_eur: 0,
    });
    expect(data.forecast_6m.map((point: { burn_eur: number }) => point.burn_eur)).toEqual([
      389, 412, 450,
    ]);
  });
});

describe('runFinanceSync — Gate-Fail', () => {
  it('lehnt inkonsistente Werte ab: KEIN Insert, Telegram-Alarm', async () => {
    loadSheetMapMock.mockReturnValue(syncMap());
    // cash negativ → Sanity-Gate (cash_on_hand_eur >= 0) schlägt fehl.
    readNamedRangeMock.mockImplementation(
      rangeResponder({
        cfo_cash_on_hand_eur: '-5.000,00 €',
        cfo_monthly_burn_actual_eur: '3.000',
        cfo_forecast_m1_cash_eur: '7.333',
        cfo_forecast_m1_burn_eur: '1.367',
        cfo_forecast_m2_cash_eur: '16.814',
        cfo_forecast_m2_burn_eur: '819',
        cfo_forecast_m3_cash_eur: '26.293',
        cfo_forecast_m3_burn_eur: '921',
        cfo_forecast_m4_cash_eur: '35.420',
        cfo_forecast_m4_burn_eur: '1.373',
        cfo_forecast_m5_cash_eur: '44.545',
        cfo_forecast_m5_burn_eur: '1.475',
        cfo_forecast_m6_cash_eur: '54.834',
        cfo_forecast_m6_burn_eur: '4.211',
        "'GuV Finanzplan'!B23:D37": [['Kosten', '', '3000']],
        "'GuV Finanzplan'!D52": 'M7',
      }),
    );

    const result = await runFinanceSync('exist');

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
