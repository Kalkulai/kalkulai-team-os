// Sanity-Gate für Finanz-Snapshots: lehnt intern widersprüchliche Daten ab.
// Läuft NACH der Boundary-Validierung (validateFinanceData) — geht also von
// strukturell korrekten Typen aus und prüft nur noch die inhaltliche Konsistenz.
// Reine Funktion, keine Mutation, keine Seiteneffekte.

import type { FinanceData } from '@/types/finance';

export type ConsistencyResult = { ok: true } | { ok: false; reason: string };

/** Toleranz für die delta_eur-Identität (Rundungsfehler in EUR). */
const DELTA_TOLERANCE_EUR = 1;
/** Toleranz für die Runway-Konsistenz in Monaten. */
const RUNWAY_TOLERANCE_MONTHS = 1.0;

/**
 * Prüft, ob ein FinanceData-Snapshot in sich konsistent ist.
 * Gibt beim ERSTEN verletzten Check zurück; der reason nennt Feld + Ist/Soll.
 */
export function checkFinanceConsistency(d: FinanceData): ConsistencyResult {
  // cash_on_hand_eur: nicht-negativ und endlich.
  if (!Number.isFinite(d.cash_on_hand_eur) || d.cash_on_hand_eur < 0) {
    return {
      ok: false,
      reason: `cash_on_hand_eur muss endlich und >= 0 sein (Ist: ${d.cash_on_hand_eur})`,
    };
  }

  // monthly_burn.actual_eur / plan_eur: nicht-negativ.
  if (d.monthly_burn.actual_eur < 0) {
    return {
      ok: false,
      reason: `monthly_burn.actual_eur muss >= 0 sein (Ist: ${d.monthly_burn.actual_eur})`,
    };
  }
  if (d.monthly_burn.plan_eur < 0) {
    return {
      ok: false,
      reason: `monthly_burn.plan_eur muss >= 0 sein (Ist: ${d.monthly_burn.plan_eur})`,
    };
  }

  // delta_eur-Identität: delta muss actual - plan sein (Toleranz 1 €).
  const expectedDelta = d.monthly_burn.actual_eur - d.monthly_burn.plan_eur;
  if (Math.abs(d.monthly_burn.delta_eur - expectedDelta) > DELTA_TOLERANCE_EUR) {
    return {
      ok: false,
      reason: `monthly_burn.delta_eur inkonsistent (Ist: ${d.monthly_burn.delta_eur}, Soll: ${expectedDelta} = actual - plan)`,
    };
  }

  // Runway-Konsistenz: nur prüfbar, wenn actual_eur > 0 (sonst Division durch 0).
  if (d.monthly_burn.actual_eur > 0) {
    const expectedRunway = d.cash_on_hand_eur / d.monthly_burn.actual_eur;
    if (Math.abs(d.runway_months - expectedRunway) > RUNWAY_TOLERANCE_MONTHS) {
      return {
        ok: false,
        reason: `runway_months inkonsistent (Ist: ${d.runway_months}, Soll: ~${expectedRunway.toFixed(2)} = cash_on_hand_eur / monthly_burn.actual_eur)`,
      };
    }
  }

  // Array-Felder: jeweils nicht-leer.
  if (d.cost_lines.length === 0) {
    return { ok: false, reason: 'cost_lines darf nicht leer sein' };
  }
  if (d.paid_by.length === 0) {
    return { ok: false, reason: 'paid_by darf nicht leer sein' };
  }
  if (d.forecast_6m.length === 0) {
    return { ok: false, reason: 'forecast_6m darf nicht leer sein' };
  }
  if (d.pilot_health.length === 0) {
    return { ok: false, reason: 'pilot_health darf nicht leer sein' };
  }

  // Hinweis: as_of wird bewusst NICHT als Datum geprüft — es ist ein Freitext-
  // Provenienz-Label ("EXIST-Finanzplan v11 · …"), kein Timestamp. Freshness läuft
  // über generated_at (serverseitig gestempelt) + created_at in der DB.

  return { ok: true };
}
