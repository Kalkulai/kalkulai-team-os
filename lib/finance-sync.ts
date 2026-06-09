// READ-Pfad für CFO-Kai: liest die Google-Sheets-Named-Ranges, baut daraus ein
// FinanceData (rechnet runway + delta SELBST, übernimmt sie NIE aus dem Sheet),
// fährt es durch das Sanity-Gate und schreibt — nur bei ok — einen Snapshot des
// aktiven Szenarios. Fail-safe: jeder Lese-/Parse-/Gate-Fehler verhindert den
// Insert (letzter guter Snapshot bleibt) und löst einen Telegram-Alarm aus.
//
// Kern bewusst als wiederverwendbare lib-Funktion (Cron-Route UND später plan-Route),
// die NIE wirft — sie gibt immer ein SyncResult zurück.

import { checkFinanceConsistency } from '@/lib/finance-gate';
import { loadSheetMap, readNamedRange, type SheetMap } from '@/lib/google-sheets';
import {
  insertFinanceSnapshot,
  isFinanceScenario,
  type FinanceScenario,
} from '@/lib/finance-store';
import { sendTelegramMessage } from '@/lib/telegram';
import type { CostLine, FinanceData, ForecastPoint, PaidBySlice } from '@/types/finance';

export type SyncResult =
  | { ok: true; id: string; data: FinanceData }
  | { ok: false; reason: string };

const SOURCE = 'cfo-kai:app-sync';

/** Live-OUTPUT-Felder, die wir aus Named Ranges mappen. */
const NUMERIC_FIELDS = new Set<string>([
  'cash_on_hand_eur',
  'monthly_burn.actual_eur',
  'forecast_6m.0.cash_eur',
  'forecast_6m.0.burn_eur',
  'forecast_6m.1.cash_eur',
  'forecast_6m.1.burn_eur',
  'forecast_6m.2.cash_eur',
  'forecast_6m.2.burn_eur',
  'forecast_6m.3.cash_eur',
  'forecast_6m.3.burn_eur',
  'forecast_6m.4.cash_eur',
  'forecast_6m.4.burn_eur',
  'forecast_6m.5.cash_eur',
  'forecast_6m.5.burn_eur',
]);

const GUV_COST_LINES_RANGE = "'GuV Finanzplan'!B23:D37";
const GUV_BREAK_EVEN_RANGE = "'GuV Finanzplan'!D52";
const EXIST_AS_OF = 'GuV Finanzplan · M1 Aug';
const EXIST_FORECAST_MONTHS = ['Aug', 'Sep', 'Okt', 'Nov', 'Dez', 'Jan'] as const;
const EXIST_PILOT_HEALTH = [{ name: '13 Piloten', status: 'green' as const, note: '' }];

const CURRENT_OVERVIEW_RANGE = "'Übersicht'!C8:D10";
const CURRENT_COST_LINES_RANGE = "'Übersicht'!G8:I11";
const CURRENT_PAID_BY_RANGE = "'Übersicht'!B16:C18";
const CURRENT_FORECAST_MONTHS = ['Jun', 'Jul', 'Aug'] as const;
const CURRENT_MONTH_ROWS = [8, 9, 10] as const;
const CURRENT_BREAK_EVEN_LABEL = 'M6 · Jan';
const CURRENT_PILOT_HEALTH = [
  { name: 'Pre-EXIST (Bootstrap)', status: 'green' as const, note: 'EXIST-Förderung ab Aug' },
];
const SCENARIO_SWITCH_AT_MS = Date.parse('2026-08-01T00:00:00.000Z');

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

export function activeScenario(now: Date = new Date()): FinanceScenario {
  const envScenario = process.env.ACTIVE_FINANCE_SCENARIO;
  if (isFinanceScenario(envScenario)) {
    return envScenario;
  }

  return now.getTime() < SCENARIO_SWITCH_AT_MS ? 'current' : 'exist';
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
 * der Map (z.B. price_full_eur) werden ignoriert. Wirft bei jedem Lese-/Parse-
 * fehler — der Aufrufer entscheidet über Retry/Alarm.
 */
async function readSheetOverrides(map: SheetMap): Promise<Map<string, number | string>> {
  const overrides = new Map<string, number | string>();

  for (const [fieldName, spec] of Object.entries(map.fields)) {
    const isNumeric = NUMERIC_FIELDS.has(fieldName);
    if (!isNumeric) continue; // nicht auf den READ-Pfad gemapptes Feld

    const sheetId = map.sheets[spec.sheet];
    const values = await readNamedRange(sheetId, spec.namedRange);
    const raw = firstCell(values, fieldName);

    overrides.set(fieldName, parseEur(raw));
  }

  return overrides;
}

/** Runden auf eine Nachkommastelle (Runway). */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function requireNumber(overrides: Map<string, number | string>, key: string): number {
  const value = overrides.get(key);
  if (typeof value !== 'number') {
    throw new Error(`Pflichtfeld "${key}" wurde nicht aus dem Sheet gelesen`);
  }
  return value;
}

function buildForecast(overrides: Map<string, number | string>): ForecastPoint[] {
  return EXIST_FORECAST_MONTHS.map((month, index) => ({
    month,
    cash_eur: requireNumber(overrides, `forecast_6m.${index}.cash_eur`),
    burn_eur: requireNumber(overrides, `forecast_6m.${index}.burn_eur`),
  }));
}

function isBlankCell(raw: string | undefined): boolean {
  return raw === undefined || raw.trim() === '';
}

function costLabel(row: string[], rowNumber: number): string {
  const label = row
    .slice(0, -1)
    .map((cell) => cell.trim())
    .find((cell) => cell !== '');
  return label ?? `Kosten Zeile ${rowNumber}`;
}

function buildCostLines(values: string[][]): CostLine[] {
  const lines: CostLine[] = [];

  values.forEach((row, index) => {
    const rawAmount = row[2];
    if (isBlankCell(rawAmount)) return;

    const amount = parseEur(rawAmount);
    if (amount === 0) return;

    lines.push({
      label: costLabel(row, 23 + index),
      amount_eur: amount,
      fixed: false,
      paid_by: 'Company',
    });
  });

  if (lines.length === 0) {
    throw new Error(`Kosten-Range ${GUV_COST_LINES_RANGE} enthält keine Kostenwerte`);
  }

  return lines;
}

function buildPaidBy(lines: CostLine[]): PaidBySlice[] {
  const byPayer = new Map<string, number>();
  for (const line of lines) {
    byPayer.set(line.paid_by, (byPayer.get(line.paid_by) ?? 0) + line.amount_eur);
  }
  return [...byPayer.entries()]
    .map(([name, value_eur]) => ({ name, value_eur }))
    .sort((a, b) => b.value_eur - a.value_eur);
}

function normalizeBreakEven(raw: string): string {
  const match = raw.match(/M\s*(\d+)\s*\(([^)]+)\)/i);
  if (!match) {
    const trimmed = raw.trim();
    return trimmed === '' ? 'M6 · Jan' : trimmed;
  }
  return `M${match[1]} · ${match[2].trim()}`;
}

async function readBreakEvenLabel(sheetId: string): Promise<string> {
  try {
    const raw = firstCell(await readNamedRange(sheetId, GUV_BREAK_EVEN_RANGE), 'break_even_label');
    return normalizeBreakEven(raw);
  } catch {
    return 'M6 · Jan';
  }
}

/**
 * Baut das FinanceData ausschließlich aus live gelesenen Sheet-Werten und
 * deterministischen Ableitungen. runway_months, plan_eur und delta_eur werden
 * nie aus dem Sheet gelesen.
 */
function assembleFinanceData(
  overrides: Map<string, number | string>,
  costLines: CostLine[],
  breakEvenLabel: string,
): FinanceData {
  const cashOnHand = requireNumber(overrides, 'cash_on_hand_eur');
  const actualEur = requireNumber(overrides, 'monthly_burn.actual_eur');
  const planEur = actualEur;

  // SELBST RECHNEN (nie aus Sheet):
  const deltaEur = actualEur - planEur;
  const runwayMonths = actualEur > 0 ? round1(cashOnHand / actualEur) : 0;

  return {
    generated_at: new Date().toISOString(),
    data_origin: 'db',
    as_of: EXIST_AS_OF,
    currency: 'EUR',
    cash_on_hand_eur: cashOnHand,
    runway_months: runwayMonths,
    break_even_label: breakEvenLabel,
    monthly_burn: {
      actual_eur: actualEur,
      plan_eur: planEur,
      delta_eur: deltaEur,
    },
    cost_lines: costLines,
    paid_by: buildPaidBy(costLines),
    forecast_6m: buildForecast(overrides),
    pilot_health: EXIST_PILOT_HEALTH,
  };
}

function parseOptionalEur(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return 0;
  return parseEur(raw);
}

function currentMonthIndex(now: Date): number {
  const month = now.getUTCMonth();
  if (month < 5 || month > 7) {
    throw new Error(`Pre-EXIST unterstützt nur Jun-Jul-Aug (Monat: ${month + 1})`);
  }
  return month - 5;
}

function currentBurnFromRow(row: string[], rowNumber: number): { actual_eur: number; plan_eur: number } {
  const planEur = parseOptionalEur(row[0]);
  const rawActual = parseOptionalEur(row[1]);
  const actualEur = rawActual === 0 ? planEur : rawActual;
  if (actualEur < 0 || planEur < 0) {
    throw new Error(`Monatsübersicht Zeile ${rowNumber} enthält negative Burn-Werte`);
  }
  return { actual_eur: actualEur, plan_eur: planEur };
}

function requireCurrentOverviewRow(values: string[][], index: number): string[] {
  const row = values[index];
  if (!row) {
    throw new Error(`Pre-EXIST Monatsübersicht: Zeile ${CURRENT_MONTH_ROWS[index]} fehlt`);
  }
  return row;
}

function buildCurrentCostLines(values: string[][]): CostLine[] {
  const lines: CostLine[] = [];

  values.forEach((row, index) => {
    const amount = parseOptionalEur(row[2]);
    if (amount <= 0) return;
    const label = row[0]?.trim();
    lines.push({
      label: label && label !== '' ? label : `Kosten Zeile ${8 + index}`,
      amount_eur: amount,
      fixed: false,
      paid_by: 'Company',
    });
  });

  if (lines.length === 0) {
    throw new Error(`Kosten-Range ${CURRENT_COST_LINES_RANGE} enthält keine Kostenwerte`);
  }

  return lines;
}

function buildCurrentPaidBy(values: string[][]): PaidBySlice[] {
  const slices: PaidBySlice[] = [];

  values.forEach((row, index) => {
    const value_eur = parseOptionalEur(row[1]);
    if (value_eur <= 0) return;
    const name = row[0]?.trim();
    slices.push({
      name: name && name !== '' ? name : `Auslage Zeile ${16 + index}`,
      value_eur,
    });
  });

  if (slices.length === 0) {
    throw new Error(`Auslagen-Range ${CURRENT_PAID_BY_RANGE} enthält keine Werte`);
  }

  return slices;
}

function buildCurrentForecast(values: string[][]): ForecastPoint[] {
  return CURRENT_FORECAST_MONTHS.map((month, index) => {
    const row = requireCurrentOverviewRow(values, index);
    const burn = currentBurnFromRow(row, CURRENT_MONTH_ROWS[index]);
    return { month, cash_eur: 0, burn_eur: burn.actual_eur };
  });
}

function assembleCurrentFinanceData(
  overviewValues: string[][],
  costLineValues: string[][],
  paidByValues: string[][],
  now: Date,
): FinanceData {
  const monthIndex = currentMonthIndex(now);
  const monthlyBurn = currentBurnFromRow(
    requireCurrentOverviewRow(overviewValues, monthIndex),
    CURRENT_MONTH_ROWS[monthIndex],
  );

  return {
    generated_at: new Date().toISOString(),
    data_origin: 'db',
    as_of: `Pre-EXIST · Übersicht · ${CURRENT_FORECAST_MONTHS[monthIndex]}`,
    currency: 'EUR',
    cash_on_hand_eur: 0,
    runway_months: 0,
    break_even_label: CURRENT_BREAK_EVEN_LABEL,
    monthly_burn: {
      actual_eur: monthlyBurn.actual_eur,
      plan_eur: monthlyBurn.plan_eur,
      delta_eur: monthlyBurn.actual_eur - monthlyBurn.plan_eur,
    },
    cost_lines: buildCurrentCostLines(costLineValues),
    paid_by: buildCurrentPaidBy(paidByValues),
    forecast_6m: buildCurrentForecast(overviewValues),
    pilot_health: CURRENT_PILOT_HEALTH,
  };
}

async function buildCurrentFromSheets(map: SheetMap, now: Date): Promise<FinanceData> {
  const preexistSheetId = map.sheets.preexist;
  if (!preexistSheetId) {
    throw new Error('Sheet-Map: "preexist" Sheet fehlt');
  }

  const [overviewValues, costLineValues, paidByValues] = await Promise.all([
    readNamedRange(preexistSheetId, CURRENT_OVERVIEW_RANGE),
    readNamedRange(preexistSheetId, CURRENT_COST_LINES_RANGE),
    readNamedRange(preexistSheetId, CURRENT_PAID_BY_RANGE),
  ]);

  return assembleCurrentFinanceData(overviewValues, costLineValues, paidByValues, now);
}

async function buildExistFromSheets(map: SheetMap): Promise<FinanceData> {
  const overrides = await readSheetOverrides(map);
  const guvSheetId = map.sheets.guv;
  if (!guvSheetId) {
    throw new Error('Sheet-Map: "guv" Sheet fehlt');
  }
  const [costLinesValues, breakEvenLabel] = await Promise.all([
    readNamedRange(guvSheetId, GUV_COST_LINES_RANGE),
    readBreakEvenLabel(guvSheetId),
  ]);
  return assembleFinanceData(overrides, buildCostLines(costLinesValues), breakEvenLabel);
}

/**
 * Liest die Sheets mit Retry bei transienten Fehlern, baut das FinanceData und
 * gibt es zurück. Wirft bei endgültigem Fehler (nicht-transient ODER Retries
 * erschöpft) — der Aufrufer (runFinanceSync) fängt das ab.
 */
async function buildFromSheetsWithRetry(
  scenario: FinanceScenario,
  now: Date,
): Promise<FinanceData> {
  const map = loadSheetMap();

  let lastErr: unknown;
  // Erster Versuch + RETRY_BACKOFF_MS.length Wiederholungen.
  for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt++) {
    try {
      return scenario === 'current' ? buildCurrentFromSheets(map, now) : buildExistFromSheets(map);
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
export async function runFinanceSync(
  scenario?: FinanceScenario,
  now: Date = new Date(),
): Promise<SyncResult> {
  const selectedScenario = scenario ?? activeScenario(now);

  // 2.–4. Sheets lesen + FinanceData bauen (mit Retry). Fehler → kein Insert + Alarm.
  let data: FinanceData;
  try {
    data = await buildFromSheetsWithRetry(selectedScenario, now);
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
    const id = await insertFinanceSnapshot(selectedScenario, data, SOURCE);
    return { ok: true, id, data };
  } catch (err) {
    const reason = `Snapshot-Insert fehlgeschlagen (${selectedScenario}): ${
      err instanceof Error ? err.message : String(err)
    }`;
    await alert(reason);
    return { ok: false, reason };
  }
}
