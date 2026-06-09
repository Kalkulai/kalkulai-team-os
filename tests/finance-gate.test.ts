import { describe, it, expect } from 'vitest';
import { checkFinanceConsistency } from '../lib/finance-gate';
import type { FinanceData } from '../types/finance';

// Valide Basis-FinanceData: cash 6000 / burn.actual 2000 → runway 3 (konsistent).
// generated_at wird serverseitig gesetzt, ist hier aber als Feld vorhanden.
function baseFinanceData(): FinanceData {
  return {
    generated_at: '2026-05-01T00:00:00.000Z',
    data_origin: 'db',
    as_of: '2026-05-01',
    currency: 'EUR',
    cash_on_hand_eur: 6000,
    runway_months: 3,
    break_even_label: 'M8 · Nov',
    monthly_burn: { actual_eur: 2000, plan_eur: 2500, delta_eur: -500 },
    cost_lines: [{ label: 'Claude', amount_eur: 210, fixed: true, paid_by: 'Felix' }],
    paid_by: [{ name: 'Felix', value_eur: 210 }],
    forecast_6m: [{ month: 'Jun', cash_eur: 4000, burn_eur: 2000 }],
    pilot_health: [{ name: 'Pilot A', status: 'green', note: 'läuft' }],
  };
}

// Immutabel: liefert neue Kopie mit überschriebenen Top-Level-Feldern.
function withOverride(patch: Partial<FinanceData>): FinanceData {
  return { ...baseFinanceData(), ...patch };
}

describe('checkFinanceConsistency — pass', () => {
  it('akzeptiert konsistente FinanceData (runway == cash/burn)', () => {
    expect(checkFinanceConsistency(baseFinanceData())).toEqual({ ok: true });
  });

  it('akzeptiert actual_eur == 0 (Runway-Check wird übersprungen)', () => {
    const d = withOverride({
      monthly_burn: { actual_eur: 0, plan_eur: 0, delta_eur: 0 },
      runway_months: 999,
    });
    expect(checkFinanceConsistency(d)).toEqual({ ok: true });
  });
});

describe('checkFinanceConsistency — fail pro Regel', () => {
  it('lehnt negatives cash_on_hand_eur ab', () => {
    const r = checkFinanceConsistency(withOverride({ cash_on_hand_eur: -1 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('cash_on_hand_eur');
  });

  it('lehnt nicht-endliches cash_on_hand_eur ab', () => {
    const r = checkFinanceConsistency(withOverride({ cash_on_hand_eur: Number.POSITIVE_INFINITY }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('cash_on_hand_eur');
  });

  it('lehnt negatives monthly_burn.actual_eur ab', () => {
    const r = checkFinanceConsistency(
      withOverride({ monthly_burn: { actual_eur: -100, plan_eur: 0, delta_eur: -100 } }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('actual_eur');
  });

  it('lehnt negatives monthly_burn.plan_eur ab', () => {
    const r = checkFinanceConsistency(
      withOverride({
        cash_on_hand_eur: 6000,
        runway_months: 3,
        monthly_burn: { actual_eur: 2000, plan_eur: -100, delta_eur: 2100 },
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('plan_eur');
  });

  it('lehnt inkonsistentes delta_eur ab (delta != actual - plan)', () => {
    const r = checkFinanceConsistency(
      withOverride({ monthly_burn: { actual_eur: 2000, plan_eur: 2500, delta_eur: 0 } }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('delta_eur');
  });

  it('lehnt inkonsistentes runway_months ab', () => {
    // cash 6000 / burn 2000 = 3, aber runway 10 → Abweichung > 1 Monat.
    const r = checkFinanceConsistency(withOverride({ runway_months: 10 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('runway_months');
  });

  it('lehnt leere cost_lines ab', () => {
    const r = checkFinanceConsistency(withOverride({ cost_lines: [] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('cost_lines');
  });

  it('lehnt leere paid_by ab', () => {
    const r = checkFinanceConsistency(withOverride({ paid_by: [] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('paid_by');
  });

  it('lehnt leere forecast_6m ab', () => {
    const r = checkFinanceConsistency(withOverride({ forecast_6m: [] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('forecast_6m');
  });

  it('lehnt leere pilot_health ab', () => {
    const r = checkFinanceConsistency(withOverride({ pilot_health: [] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('pilot_health');
  });

  it('akzeptiert as_of als Freitext-Label (kein Datum)', () => {
    const r = checkFinanceConsistency(
      withOverride({ as_of: 'EXIST-Finanzplan v11 · Förderstart Aug 2026 · Plan-Szenario' }),
    );
    expect(r.ok).toBe(true);
  });
});

describe('checkFinanceConsistency — Regression (realer Bug)', () => {
  it('lehnt cash 7333 / burn.actual 1367 / runway 18 ab (Runway-Regel)', () => {
    const d = withOverride({
      cash_on_hand_eur: 7333,
      runway_months: 18,
      monthly_burn: { actual_eur: 1367, plan_eur: 2500, delta_eur: -1133 },
    });
    const r = checkFinanceConsistency(d);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('runway_months');
  });

  it('akzeptiert denselben Datensatz mit runway 5', () => {
    // 7333 / 1367 ≈ 5.36 → Abweichung zu 5 ist 0.36 < 1.0.
    const d = withOverride({
      cash_on_hand_eur: 7333,
      runway_months: 5,
      monthly_burn: { actual_eur: 1367, plan_eur: 2500, delta_eur: -1133 },
    });
    expect(checkFinanceConsistency(d)).toEqual({ ok: true });
  });
});
