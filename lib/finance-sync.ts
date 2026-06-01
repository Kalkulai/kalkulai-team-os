// READ-Pfad für CFO-Kai: liest die Google-Sheets-Named-Ranges, baut daraus ein
// FinanceData (rechnet runway + delta SELBST, übernimmt sie NIE aus dem Sheet),
// fährt es durch das Sanity-Gate und schreibt — nur bei ok — einen Snapshot des
// aktiven Szenarios. Fail-safe: jeder Lese-/Parse-/Gate-Fehler verhindert den
// Insert (letzter guter Snapshot bleibt) und löst einen Telegram-Alarm aus.
//
// Kern bewusst als wiederverwendbare lib-Funktion (Cron-Route UND später plan-Route),
// die NIE wirft — sie gibt immer ein SyncResult zurück.

import { buildFinanceData } from '@/lib/finance-data';
import { checkFinanceConsistency } from '@/lib/finance-gate';
import { loadSheetMap, readNamedRange, type SheetMap } from '@/lib/google-sheets';
import {
  insertFinanceSnapshot,
  isFinanceScenario,
  type FinanceScenario,
} from '@/lib/finance-store';
import { sendTelegramMessage } from '@/lib/telegram';
import type { FinanceData } from '@/types/finance';

export type SyncResult =
  | { ok: true; id: string; data: FinanceData }
  | { ok: false; reason: string };

const SOURCE = 'cfo-kai:app-sync';

/** Skalar-Felder, die wir aus dem Sheet mappen. Punkt-Pfade adressieren
 *  verschachtelte Felder (z.B. "monthly_burn.actual_eur"). break_even_label
 *  bleibt String, alle anderen werden via parseEur zu number. */
const NUMERIC_FIELDS = new Set<string>([
  'cash_on_hand_eur',
  'monthly_burn.actual_eur',
  'monthly_burn.plan_eur',
]);
const STRING_FIELDS = new Set<string>(['break_even_label']);

/** Backoff-Stufen für transiente Fehler (Netzwerk/5xx). */
const RETRY_BACKOFF_MS: readonly number[] = [300, 900, 2700];

/**
 * Parst einen EUR-String im deutschen Format zu einer Zahl.
 *   "1.367,00 €" → 1367   (Tausenderpunkt entfernt, Dezimalkomma → Punkt)
 *   "7.333"      → 7333
 *   "-250,50 €"  → -250.5
 * Wirft bei nicht-parsebarem Input (fail-fast, kein stilles 0).
 */
export function parseEur(raw: string): number {
  const cleaned = raw
    .replace(/[€\s]/g, '') // Währungssymbol + Whitespace weg
    .replace(/\./g, '') // Tausenderpunkte weg
    .replace(/,/g, '.'); // Dezimalkomma → Punkt
  if (cleaned === '' || cleaned === '-') {
    throw new Error(`EUR-Wert nicht parsebar: "${raw}"`);
  }
  const value = Number(cleaned);
  if (!Number.isFinite(value)) {
    throw new Error(`EUR-Wert nicht parsebar: "${raw}"`);
  }
  return value;
}

/** Erkennt transiente Fehler (Netzwerk/5xx), die einen Retry rechtfertigen. */
function isTransientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (/\b(429|5\d{2})\b/.test(msg)) return true;
  return /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|network|timeout|fetch failed/i.test(
    msg,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Erste Zelle einer Range als String (leerer Range → Fehler, fail-fast). */
function firstCell(values: string[][], fieldName: string): string {
  const cell = values[0]?.[0];
  if (cell === undefined || cell === '') {
    throw new Error(`Named Range für "${fieldName}" ist leer`);
  }
  return cell;
}

/**
 * Liest alle gemappten Skalar-Felder aus dem Sheet und gibt die rohen Overrides
 * als Punkt-Pfad → Wert (number | string) zurück. Nicht-FinanceData-Felder in
 * der Map (z.B. price_per_pilot) werden ignoriert. Wirft bei jedem Lese-/Parse-
 * fehler — der Aufrufer entscheidet über Retry/Alarm.
 */
async function readSheetOverrides(map: SheetMap): Promise<Map<string, number | string>> {
  const overrides = new Map<string, number | string>();

  for (const [fieldName, spec] of Object.entries(map.fields)) {
    const isNumeric = NUMERIC_FIELDS.has(fieldName);
    const isString = STRING_FIELDS.has(fieldName);
    if (!isNumeric && !isString) continue; // nicht auf FinanceData gemapptes Feld

    const sheetId = map.sheets[spec.sheet];
    const values = await readNamedRange(sheetId, spec.namedRange);
    const raw = firstCell(values, fieldName);

    overrides.set(fieldName, isNumeric ? parseEur(raw) : raw);
  }

  return overrides;
}

/** Liefert eine Zahl-Override oder den Default — type-safe, ohne `any`. */
function numberOr(overrides: Map<string, number | string>, key: string, fallback: number): number {
  const v = overrides.get(key);
  return typeof v === 'number' ? v : fallback;
}

/** Liefert eine String-Override oder den Default. */
function stringOr(overrides: Map<string, number | string>, key: string, fallback: string): string {
  const v = overrides.get(key);
  return typeof v === 'string' ? v : fallback;
}

/** Runden auf eine Nachkommastelle (Runway). */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Baut das FinanceData immutabel: Defaults (aus finance-data.ts) gespreadet,
 * dann die gemappten Sheet-Werte als Overrides. runway_months + delta_eur werden
 * IMMER selbst gerechnet — nie aus dem Sheet übernommen. Komplexe/ungemappte
 * Felder (cost_lines, paid_by, forecast_6m, pilot_health) bleiben Defaults.
 */
function assembleFinanceData(overrides: Map<string, number | string>): FinanceData {
  const defaults = buildFinanceData();

  const cashOnHand = numberOr(overrides, 'cash_on_hand_eur', defaults.cash_on_hand_eur);
  const actualEur = numberOr(
    overrides,
    'monthly_burn.actual_eur',
    defaults.monthly_burn.actual_eur,
  );
  const planEur = numberOr(overrides, 'monthly_burn.plan_eur', defaults.monthly_burn.plan_eur);

  // SELBST RECHNEN (nie aus Sheet):
  const deltaEur = actualEur - planEur;
  const runwayMonths = actualEur > 0 ? round1(cashOnHand / actualEur) : 0;

  return {
    ...defaults,
    cash_on_hand_eur: cashOnHand,
    runway_months: runwayMonths,
    break_even_label: stringOr(overrides, 'break_even_label', defaults.break_even_label),
    monthly_burn: {
      ...defaults.monthly_burn,
      actual_eur: actualEur,
      plan_eur: planEur,
      delta_eur: deltaEur,
    },
  };
}

/**
 * Liest die Sheets mit Retry bei transienten Fehlern, baut das FinanceData und
 * gibt es zurück. Wirft bei endgültigem Fehler (nicht-transient ODER Retries
 * erschöpft) — der Aufrufer (runFinanceSync) fängt das ab.
 */
async function buildFromSheetsWithRetry(): Promise<FinanceData> {
  const map = loadSheetMap();

  let lastErr: unknown;
  // Erster Versuch + RETRY_BACKOFF_MS.length Wiederholungen.
  for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt++) {
    try {
      const overrides = await readSheetOverrides(map);
      return assembleFinanceData(overrides);
    } catch (err) {
      lastErr = err;
      // Nicht-transiente Fehler (fehlende Range, kaputte Zelle) → kein Retry.
      if (!isTransientError(err) || attempt === RETRY_BACKOFF_MS.length) {
        throw err;
      }
      await sleep(RETRY_BACKOFF_MS[attempt]);
    }
  }
  // Unerreichbar, aber type-safe: lastErr garantiert gesetzt.
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * Sendet einen Finance-Alarm an FINANCE_ALERT_CHAT_ID. Nie crashen — jeder
 * Telegram-Fehler wird geschluckt (geloggt), damit der Sync-Pfad robust bleibt.
 */
async function alert(reason: string): Promise<void> {
  const chatId = process.env.FINANCE_ALERT_CHAT_ID;
  if (!chatId) {
    console.error('[finance-sync] kein FINANCE_ALERT_CHAT_ID gesetzt, Alarm:', reason);
    return;
  }
  try {
    const res = await sendTelegramMessage(
      chatId,
      `🚨 *CFO-Kai Finance-Sync fehlgeschlagen*\n\n${reason}`,
    );
    if (!res.ok) {
      console.error('[finance-sync] Telegram-Alarm nicht zugestellt:', res.error);
    }
  } catch (err) {
    console.error('[finance-sync] Telegram-Alarm warf:', err);
  }
}

/**
 * Kernlogik des READ-Pfads. Liest Sheets → baut FinanceData → Gate → Insert.
 * Wirft NIE — gibt immer ein SyncResult zurück. Jeder Lese-/Parse-/Gate-Fehler
 * verhindert den Insert (letzter guter Snapshot bleibt) und löst einen Alarm aus.
 */
export async function runFinanceSync(): Promise<SyncResult> {
  // 1. Aktives Szenario aus Env, validiert (Default 'current').
  const envScenario = process.env.ACTIVE_FINANCE_SCENARIO;
  const activeScenario: FinanceScenario = isFinanceScenario(envScenario)
    ? envScenario
    : 'current';

  // 2.–4. Sheets lesen + FinanceData bauen (mit Retry). Fehler → kein Insert + Alarm.
  let data: FinanceData;
  try {
    data = await buildFromSheetsWithRetry();
  } catch (err) {
    const reason = `Sheet-Lesen/Parsen fehlgeschlagen: ${
      err instanceof Error ? err.message : String(err)
    }`;
    await alert(reason);
    return { ok: false, reason };
  }

  // 5. Sanity-Gate. Bei ok:false → KEIN Insert, Alarm.
  const gate = checkFinanceConsistency(data);
  if (!gate.ok) {
    const reason = `Sanity-Gate abgelehnt: ${gate.reason}`;
    await alert(reason);
    return { ok: false, reason };
  }

  // 6. Insert des aktiven Szenarios. Auch ein DB-Fehler darf nicht crashen.
  try {
    const id = await insertFinanceSnapshot(activeScenario, data, SOURCE);
    return { ok: true, id, data };
  } catch (err) {
    const reason = `Snapshot-Insert fehlgeschlagen (${activeScenario}): ${
      err instanceof Error ? err.message : String(err)
    }`;
    await alert(reason);
    return { ok: false, reason };
  }
}
