import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { runFinanceSync } from '@/lib/finance-sync';
import {
  loadSheetMap,
  readNamedRange,
  writeNamedRange,
  type FieldSpec,
  type SheetMap,
} from '@/lib/google-sheets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * WRITE-Pfad für CFO-Kai: schreibt geplante Wert-Änderungen in das Google-Sheet —
 * aber strukturell NUR in Input-Named-Ranges (kind:'input', Allow-List). Output-
 * Zellen (Formel-/Ergebnisfelder) sind nie beschreibbar. Dry-Run liefert den Diff
 * alt→neu, ohne zu schreiben. Apply schreibt jeden Edit einzeln und triggert danach
 * runFinanceSync() (kein Self-HTTP), damit der neu gerechnete Snapshot persistiert.
 */

/** Ein einzelner Plan-Edit nach Boundary-Validierung. */
interface PlanEdit {
  field: string;
  value: number;
}

/** Validierter Request-Body. */
interface PlanPatch {
  intent: string;
  edits: PlanEdit[];
  dryRun?: boolean;
}

/** Diff-Zeile pro Edit (alt aus Sheet, neu aus Edit). */
interface PlanDiff {
  field: string;
  namedRange: string;
  sheet: string;
  old: string;
  new: number;
}

/** Schmaler Record-Type-Guard ohne `any`. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validiert den rohen Body (unknown → PlanPatch) an der System-Grenze.
 * Gibt bei kaputtem Body einen Error-String zurück (Aufrufer → 400), sonst null.
 */
function parsePlanPatch(raw: unknown): { patch: PlanPatch } | { error: string } {
  if (!isRecord(raw)) {
    return { error: 'Body muss ein Objekt sein' };
  }
  const { intent, edits, dryRun } = raw;

  if (typeof intent !== 'string' || intent === '') {
    return { error: 'intent muss ein nicht-leerer String sein' };
  }
  if (!Array.isArray(edits) || edits.length === 0) {
    return { error: 'edits muss ein nicht-leeres Array sein' };
  }

  const parsedEdits: PlanEdit[] = [];
  for (const edit of edits) {
    if (!isRecord(edit)) {
      return { error: 'jeder edit muss ein Objekt sein' };
    }
    if (typeof edit.field !== 'string' || edit.field === '') {
      return { error: 'edit.field muss ein nicht-leerer String sein' };
    }
    if (typeof edit.value !== 'number' || !Number.isFinite(edit.value)) {
      return { error: `edit.value für '${edit.field}' muss eine endliche Zahl sein` };
    }
    parsedEdits.push({ field: edit.field, value: edit.value });
  }

  if (dryRun !== undefined && typeof dryRun !== 'boolean') {
    return { error: 'dryRun muss ein Boolean sein, wenn gesetzt' };
  }

  return { patch: { intent, edits: parsedEdits, dryRun } };
}

/** Erste Zelle einer Range als String (leere Range → leerer String). */
function firstCell(values: string[][]): string {
  const cell = values[0]?.[0];
  return cell === undefined ? '' : cell;
}

/**
 * Löst jeden Edit gegen die Sheet-Map auf und erzwingt die Allow-List:
 * unbekanntes Feld → Fehler, kind:'output' → Fehler. Nur kind:'input' passiert.
 * Gibt die aufgelösten FieldSpecs in Edit-Reihenfolge zurück.
 */
function resolveInputFields(
  patch: PlanPatch,
  map: SheetMap,
): { specs: FieldSpec[] } | { error: string } {
  const specs: FieldSpec[] = [];
  for (const edit of patch.edits) {
    const spec = map.fields[edit.field];
    if (!spec) {
      return { error: `Feld '${edit.field}' nicht in Sheet-Map` };
    }
    // ALLOW-LIST: strukturell nur Input-Felder beschreibbar.
    if (spec.kind !== 'input') {
      return {
        error: `Feld '${edit.field}' ist kein Input (kind=output, Formel-/Ergebniszelle, nicht beschreibbar)`,
      };
    }
    specs.push(spec);
  }
  return { specs };
}

async function handlePost(req: NextRequest): Promise<NextResponse> {
  if (!requireApiAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 1. Body parsen + Boundary-validieren.
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body ist kein gültiges JSON' }, { status: 400 });
  }

  const parsed = parsePlanPatch(rawBody);
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { patch } = parsed;

  // 2. Sheet-Map laden + Allow-List erzwingen (KEIN Write bei Verstoß).
  let map: SheetMap;
  try {
    map = loadSheetMap();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sheet-Map konnte nicht geladen werden';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const resolved = resolveInputFields(patch, map);
  if ('error' in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: 400 });
  }
  const { specs } = resolved;

  // 3. Aktuellen Wert jeder Ziel-Range lesen → Diff alt→neu bauen.
  let diff: PlanDiff[];
  try {
    diff = await Promise.all(
      patch.edits.map(async (edit, i): Promise<PlanDiff> => {
        const spec = specs[i];
        const sheetId = map.sheets[spec.sheet];
        const values = await readNamedRange(sheetId, spec.namedRange);
        return {
          field: edit.field,
          namedRange: spec.namedRange,
          sheet: spec.sheet,
          old: firstCell(values),
          new: edit.value,
        };
      }),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lesen der Ziel-Ranges fehlgeschlagen';
    return NextResponse.json(
      { error: `Aktuelle Werte konnten nicht gelesen werden: ${message}` },
      { status: 502 },
    );
  }

  // 4. Dry-Run: nur Diff zurück, NICHT schreiben.
  const isDryRun = req.nextUrl.searchParams.get('dryRun') === '1' || patch.dryRun === true;
  if (isDryRun) {
    return NextResponse.json({ ok: true, dryRun: true, diff });
  }

  // 5. Apply: jeden Edit einzeln schreiben. Schreibfehler → 502 mit konkretem Feld.
  for (let i = 0; i < patch.edits.length; i++) {
    const edit = patch.edits[i];
    const spec = specs[i];
    const sheetId = map.sheets[spec.sheet];
    try {
      await writeNamedRange(sheetId, spec.namedRange, [[edit.value]]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unbekannter Schreibfehler';
      return NextResponse.json(
        { error: `Schreiben von Feld '${edit.field}' fehlgeschlagen: ${message}` },
        { status: 502 },
      );
    }
  }

  // 6. Modell hat neu gerechnet → Snapshot via direktem lib-Call aktualisieren.
  const sync = await runFinanceSync();

  return NextResponse.json({
    ok: true,
    applied: diff,
    sync: sync.ok ? { ok: true, id: sync.id } : { ok: false, reason: sync.reason },
  });
}

export function POST(req: NextRequest): Promise<NextResponse> {
  return handlePost(req);
}
