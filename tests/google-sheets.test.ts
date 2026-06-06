import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks (keine echten Creds, keine echten Sheets-Calls) ---
// values.update/get werden als Spies vorgehalten, damit Tests die Aufruf-Args prüfen.
const valuesUpdate = vi.fn();
const valuesGet = vi.fn();

// JWT als echte Klasse mocken, damit `new google.auth.JWT(...)` funktioniert.
// Klasse innerhalb der (gehoisteten) Factory, um TDZ-Probleme zu vermeiden.
vi.mock('googleapis', () => ({
  google: {
    auth: {
      JWT: class FakeJWT {},
    },
    sheets: vi.fn(() => ({
      spreadsheets: {
        values: {
          update: valuesUpdate,
          get: valuesGet,
        },
      },
    })),
  },
}));

vi.mock('google-auth-library', () => ({
  JWT: class FakeJWT {},
}));

import {
  loadSheetMap,
  validateSheetMap,
  writeNamedRange,
  readNamedRange,
  type SheetMap,
} from '../lib/google-sheets';

// Valide Minimal-Config für die Shape-Validierung.
function validMap(): SheetMap {
  return {
    sheets: { guv: 'sheet-id-1', finanzplan: 'sheet-id-2' },
    fields: {
      cash_on_hand_eur: { sheet: 'guv', namedRange: 'cash_on_hand', kind: 'output' },
      price_per_pilot: { sheet: 'finanzplan', namedRange: 'price_per_pilot', kind: 'input' },
    },
  };
}

beforeEach(() => {
  valuesUpdate.mockReset();
  valuesGet.mockReset();
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({
    client_email: 'svc@example.iam.gserviceaccount.com',
    private_key: 'fake-key',
  });
});

describe('loadSheetMap — reale Platzhalter-Config', () => {
  it('liest config/finance-sheet-map.json und liefert eine getypte SheetMap', () => {
    const map = loadSheetMap();
    expect(Object.keys(map.sheets).length).toBeGreaterThan(0);
    expect(map.fields.cash_on_hand_eur).toEqual({
      sheet: 'guv',
      namedRange: 'cfo_cash_on_hand_eur',
      kind: 'output',
    });
    // Jedes Feld referenziert ein existierendes Sheet.
    for (const spec of Object.values(map.fields)) {
      expect(map.sheets[spec.sheet]).toBeDefined();
    }
  });

  it('deckt die CFO-Kai Ergebnisfelder read-only und Plan-Hebel writable ab', () => {
    const map = loadSheetMap();

    expect(map.fields['monthly_burn.plan_eur']).toMatchObject({ kind: 'input' });
    expect(map.fields['plan.cost_lines.marketing_m1_eur']).toMatchObject({ kind: 'input' });
    expect(map.fields['plan.coaching.reserve_eur']).toMatchObject({ kind: 'input' });

    for (const field of [
      'cash_on_hand_eur',
      'monthly_burn.actual_eur',
      'monthly_burn.delta_eur',
      'runway_months',
      'break_even_label',
    ]) {
      expect(map.fields[field]).toMatchObject({ kind: 'output' });
    }
  });
});

describe('validateSheetMap — valide Config', () => {
  it('akzeptiert eine korrekte Map und gibt eine neue (nicht identische) Kopie zurück', () => {
    const input = validMap();
    const result = validateSheetMap(input);
    expect(result).toEqual(input);
    expect(result).not.toBe(input);
  });
});

describe('validateSheetMap — kaputte Config wirft', () => {
  it('wirft, wenn field.sheet auf nicht-existentes Sheet zeigt', () => {
    const broken = {
      sheets: { guv: 'id' },
      fields: { x: { sheet: 'nope', namedRange: 'r', kind: 'output' } },
    };
    expect(() => validateSheetMap(broken)).toThrow(/existiert nicht/);
  });

  it('wirft bei fehlendem kind', () => {
    const broken = {
      sheets: { guv: 'id' },
      fields: { x: { sheet: 'guv', namedRange: 'r' } },
    };
    expect(() => validateSheetMap(broken)).toThrow(/kind/);
  });

  it('wirft bei ungültigem kind', () => {
    const broken = {
      sheets: { guv: 'id' },
      fields: { x: { sheet: 'guv', namedRange: 'r', kind: 'maybe' } },
    };
    expect(() => validateSheetMap(broken)).toThrow(/kind/);
  });

  it('wirft bei leerem sheets', () => {
    expect(() => validateSheetMap({ sheets: {}, fields: {} })).toThrow(/leer/);
  });

  it('wirft bei fehlendem namedRange', () => {
    const broken = {
      sheets: { guv: 'id' },
      fields: { x: { sheet: 'guv', kind: 'input' } },
    };
    expect(() => validateSheetMap(broken)).toThrow(/namedRange/);
  });
});

describe('writeNamedRange — adressiert genau die übergebene Range', () => {
  it('ruft values.update mit der übergebenen range + RAW auf', async () => {
    valuesUpdate.mockResolvedValue({ data: {} });

    await writeNamedRange('sheet-id-1', 'burn_plan', [[1234]]);

    expect(valuesUpdate).toHaveBeenCalledTimes(1);
    expect(valuesUpdate).toHaveBeenCalledWith({
      spreadsheetId: 'sheet-id-1',
      range: 'burn_plan',
      valueInputOption: 'RAW',
      requestBody: { values: [[1234]] },
    });
  });

  it('propagiert Sheets-API-Fehler (kein Schlucken)', async () => {
    valuesUpdate.mockRejectedValue(new Error('PERMISSION_DENIED'));
    await expect(writeNamedRange('sheet-id-1', 'burn_plan', [[1]])).rejects.toThrow(
      'PERMISSION_DENIED',
    );
  });
});

describe('readNamedRange — liest die übergebene Range', () => {
  it('ruft values.get mit der range auf und liefert string[][]', async () => {
    valuesGet.mockResolvedValue({ data: { values: [['7333']] } });

    const out = await readNamedRange('sheet-id-1', 'cash_on_hand');

    expect(valuesGet).toHaveBeenCalledWith({
      spreadsheetId: 'sheet-id-1',
      range: 'cash_on_hand',
    });
    expect(out).toEqual([['7333']]);
  });

  it('liefert leeres Array, wenn keine Werte vorhanden sind', async () => {
    valuesGet.mockResolvedValue({ data: {} });
    expect(await readNamedRange('sheet-id-1', 'cash_on_hand')).toEqual([]);
  });
});

describe('buildAuth via readNamedRange — Env-Var-Boundary', () => {
  it('wirft, wenn GOOGLE_SERVICE_ACCOUNT_JSON fehlt', async () => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    await expect(readNamedRange('s', 'r')).rejects.toThrow(/GOOGLE_SERVICE_ACCOUNT_JSON/);
  });

  it('wirft, wenn GOOGLE_SERVICE_ACCOUNT_JSON kein gültiges JSON ist', async () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = '{not json';
    await expect(readNamedRange('s', 'r')).rejects.toThrow(/gültiges JSON/);
  });
});
