# EXIST-Planungsansicht (Timeline) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Füge der bestehenden EXIST-Finanzansicht in TeamOS einen dritten Tab „EXIST-Planung" hinzu, der geplante Sachmittel- und Coaching-Ausgaben von Aug 2026 – Jul 2027 als monatliche Timeline darstellt (read-only, Phase 1: statische Daten).

**Architecture:** Statische Planungsdaten in `lib/exist-planning-data.ts` → `GET /api/finance/planning` gibt sie zurück → `ExistPlanningTimeline.tsx` rendert eine Gantt-style Timeline (CSS Grid, kein neue Bibliothek) → dritter Tab-Button in `CompanyPageClient.tsx` schaltet die Ansicht um. Kein DB-Zugriff in Phase 1. Phase 2 (Plan-vs-Ist-Abgleich) kann später den gleichen API-Endpoint um `actual_eur` erweitern.

**Tech Stack:** Next.js App Router, TypeScript (kein `any`), Tailwind CSS + CSS-Variablen (`var(--...)`), Vitest für Tests.

---

## Dateistruktur

| Datei | Aktion | Verantwortung |
|---|---|---|
| `types/exist-planning.ts` | Erstellen | `PlanningItem`, `PlanningData` Typen |
| `lib/exist-planning-data.ts` | Erstellen | Statische Planungsdaten Aug 2026–Jul 2027 |
| `app/api/finance/planning/route.ts` | Erstellen | `GET /api/finance/planning` mit Bearer-Auth |
| `tests/finance-planning-api.test.ts` | Erstellen | Vitest-Tests für den API-Endpunkt |
| `components/finance/ExistPlanningTimeline.tsx` | Erstellen | Timeline-Komponente (Gantt-style CSS Grid) |
| `app/dashboard/company/CompanyPageClient.tsx` | Modifizieren | Dritter Tab-Button + Render-Zweig für Planung |

---

## Task 1: Typen für Planungsdaten

**Files:**
- Create: `types/exist-planning.ts`

- [ ] **Schritt 1: Typen-Datei erstellen**

```typescript
// types/exist-planning.ts

export type PlanningCategory = 'sachmittel' | 'coaching';
export type PlanningStatus = 'planned' | 'done' | 'partial';

export interface PlanningItem {
  id: string;
  name: string;
  category: PlanningCategory;
  /** ISO-Monatsliste, z.B. ['2026-08', '2026-09'] */
  months: string[];
  amount_eur_total: number;
  /** bei recurring: Betrag pro Monat; bei einmalig: undefined */
  amount_eur_per_month?: number;
  is_recurring: boolean;
  is_critical: boolean;
  status: PlanningStatus;
  description?: string;
}

export interface PlanningData {
  items: PlanningItem[];
  funding_start: string; // 'YYYY-MM'
  funding_end: string;   // 'YYYY-MM'
  generated_at: string;  // ISO 8601
}
```

- [ ] **Schritt 2: Commit**

```bash
git add types/exist-planning.ts
git commit -m "feat(finance): add EXIST planning types"
```

---

## Task 2: Statische Planungsdaten

**Files:**
- Create: `lib/exist-planning-data.ts`

**Kontext:** Werte basieren auf `existBudgetConfig` (Sachmittel: 30.000 €, Coaching: 5.000 €, Aug 2026–Jul 2027). Die Einzelposten sind PLATZHALTER — mit den echten Zeilen aus Sachmittelplanung_v12 und Coachingplanung_v12 ersetzen.

Die Hilfsfunktion `monthRange(start, end)` erzeugt alle YYYY-MM-Strings von `start` bis `end` (inklusive).

- [ ] **Schritt 1: Datei erstellen**

```typescript
// lib/exist-planning-data.ts
import type { PlanningData, PlanningItem } from '@/types/exist-planning';

/** Erzeugt ['YYYY-MM', ...] von start bis end (inklusive). */
function monthRange(start: string, end: string): string[] {
  const result: string[] = [];
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    result.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return result;
}

// PLATZHALTER-DATEN — mit echten Zeilen aus v12-Spreadsheets ersetzen.
// Sachmittel gesamt: 30.000 €  |  Coaching gesamt: 5.000 €
const ALL_MONTHS = monthRange('2026-08', '2027-07');

const ITEMS: PlanningItem[] = [
  // ── Sachmittel ───────────────────────────────────────────────────────
  {
    id: 'sm-cloud',
    name: 'Cloud-Infrastruktur & API-Credits',
    category: 'sachmittel',
    months: ALL_MONTHS,
    amount_eur_total: 15_000,
    amount_eur_per_month: 1_250,
    is_recurring: true,
    is_critical: true,
    status: 'planned',
    description: 'Hetzner, OpenAI, Azure — monatliche Abonnements',
  },
  {
    id: 'sm-lizenzen',
    name: 'Software-Lizenzen (SaaS)',
    category: 'sachmittel',
    months: ALL_MONTHS,
    amount_eur_total: 3_000,
    amount_eur_per_month: 250,
    is_recurring: true,
    is_critical: false,
    status: 'planned',
    description: 'Linear, Vercel, sonstige Tool-Abos',
  },
  {
    id: 'sm-hardware',
    name: 'Hardware-Ausstattung',
    category: 'sachmittel',
    months: ['2026-08'],
    amount_eur_total: 8_000,
    is_recurring: false,
    is_critical: true,
    status: 'planned',
    description: 'Einmaliger Hardware-Kauf bei Programmstart',
  },
  {
    id: 'sm-legal',
    name: 'Zertifizierungen & Rechtsberatung',
    category: 'sachmittel',
    months: ['2027-02', '2027-03'],
    amount_eur_total: 4_000,
    is_recurring: false,
    is_critical: false,
    status: 'planned',
    description: 'Datenschutz-Audit, ggf. Patentberatung',
  },
  // ── Coaching ─────────────────────────────────────────────────────────
  {
    id: 'co-block1',
    name: 'Mentoring / Coaching Block 1',
    category: 'coaching',
    months: ['2026-10', '2026-11'],
    amount_eur_total: 2_500,
    is_recurring: false,
    is_critical: false,
    status: 'planned',
    description: 'Gründungsberatung Q4 2026',
  },
  {
    id: 'co-block2',
    name: 'Mentoring / Coaching Block 2',
    category: 'coaching',
    months: ['2027-03', '2027-04'],
    amount_eur_total: 2_500,
    is_recurring: false,
    is_critical: false,
    status: 'planned',
    description: 'Pitch-Coaching Frühling 2027',
  },
];

export function getPlanningData(): PlanningData {
  return {
    items: ITEMS,
    funding_start: '2026-08',
    funding_end: '2027-07',
    generated_at: new Date().toISOString(),
  };
}
```

- [ ] **Schritt 2: Commit**

```bash
git add lib/exist-planning-data.ts
git commit -m "feat(finance): add static EXIST planning data (placeholder, v12 to follow)"
```

---

## Task 3: API-Endpunkt GET /api/finance/planning

**Files:**
- Create: `app/api/finance/planning/route.ts`

Pattern: Bearer-Auth wie alle anderen `/api/finance/*`-Routen.

- [ ] **Schritt 1: Route-Datei erstellen**

```typescript
// app/api/finance/planning/route.ts
import { NextResponse } from 'next/server';
import { getPlanningData } from '@/lib/exist-planning-data';

const SECRET = process.env.DASHBOARD_API_SECRET ?? '';

export async function GET(request: Request): Promise<NextResponse> {
  const auth = request.headers.get('authorization') ?? '';
  if (!SECRET || auth !== `Bearer ${SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json(getPlanningData());
}
```

- [ ] **Schritt 2: Commit**

```bash
git add app/api/finance/planning/route.ts
git commit -m "feat(finance): GET /api/finance/planning endpoint"
```

---

## Task 4: Tests für den API-Endpunkt

**Files:**
- Create: `tests/finance-planning-api.test.ts`

Pattern: identisch zu `tests/finance-snapshot-api.test.ts` — Vitest + Next.js `NextRequest`.

- [ ] **Schritt 1: Test-Datei erstellen**

```typescript
// tests/finance-planning-api.test.ts
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/finance/planning/route';

const SECRET = 'unit-test-secret';

function makeRequest(token?: string): NextRequest {
  return new NextRequest('http://localhost/api/finance/planning', {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe('GET /api/finance/planning', () => {
  const origEnv = process.env.DASHBOARD_API_SECRET;

  beforeEach(() => {
    process.env.DASHBOARD_API_SECRET = SECRET;
  });

  afterEach(() => {
    process.env.DASHBOARD_API_SECRET = origEnv;
  });

  it('gibt 401 ohne Token', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('gibt 401 mit falschem Token', async () => {
    const res = await GET(makeRequest('wrong-secret'));
    expect(res.status).toBe(401);
  });

  it('gibt 200 mit PlanningData-Shape', async () => {
    const res = await GET(makeRequest(SECRET));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('items');
    expect(Array.isArray(body.items)).toBe(true);
    expect(body).toHaveProperty('funding_start', '2026-08');
    expect(body).toHaveProperty('funding_end', '2027-07');
    expect(body).toHaveProperty('generated_at');
  });

  it('alle Items haben Pflichtfelder', async () => {
    const res = await GET(makeRequest(SECRET));
    const body = await res.json();
    for (const item of body.items) {
      expect(typeof item.id).toBe('string');
      expect(['sachmittel', 'coaching']).toContain(item.category);
      expect(Array.isArray(item.months)).toBe(true);
      expect(item.months.length).toBeGreaterThan(0);
      expect(typeof item.amount_eur_total).toBe('number');
      expect(['planned', 'done', 'partial']).toContain(item.status);
    }
  });

  it('Sachmittel-Summe ergibt 30.000 €', async () => {
    const res = await GET(makeRequest(SECRET));
    const body = await res.json();
    const total = body.items
      .filter((i: { category: string }) => i.category === 'sachmittel')
      .reduce((sum: number, i: { amount_eur_total: number }) => sum + i.amount_eur_total, 0);
    expect(total).toBe(30_000);
  });

  it('Coaching-Summe ergibt 5.000 €', async () => {
    const res = await GET(makeRequest(SECRET));
    const body = await res.json();
    const total = body.items
      .filter((i: { category: string }) => i.category === 'coaching')
      .reduce((sum: number, i: { amount_eur_total: number }) => sum + i.amount_eur_total, 0);
    expect(total).toBe(5_000);
  });
});
```

- [ ] **Schritt 2: Tests ausführen (erwarten: PASS)**

```bash
cd /Users/felixmagiera/conductor/workspaces/kalkulai-team-os/bucharest
npx vitest run tests/finance-planning-api.test.ts
```

Erwartet: alle 5 Tests grün.

- [ ] **Schritt 3: Commit**

```bash
git add tests/finance-planning-api.test.ts
git commit -m "test(finance): API tests for GET /api/finance/planning"
```

---

## Task 5: ExistPlanningTimeline-Komponente

**Files:**
- Create: `components/finance/ExistPlanningTimeline.tsx`

Die Komponente holt die Daten von `/api/finance/planning` und rendert eine Gantt-style Timeline per CSS Grid.

**Layout-Prinzip:** Das Grid hat 1 Spalte für das Item-Label + 12 Spalten für die Monate. Jedes Item belegt via `grid-column: <startIdx> / <endIdx>` genau die richtigen Monats-Spalten.

Die 12 Monate (Aug 2026–Jul 2027) werden als Array `ALL_MONTHS` im Client berechnet — gleiche Logik wie im `getPlanningData()`, aber inline als Konstante, damit keine Server-Lib ins Client-Bundle kommt.

- [ ] **Schritt 1: Komponente erstellen**

```tsx
// components/finance/ExistPlanningTimeline.tsx
'use client';

import { useEffect, useState } from 'react';
import type { PlanningData, PlanningItem } from '@/types/exist-planning';
import { formatEur } from '@/lib/finance-format';

const SECRET = process.env.NEXT_PUBLIC_DASHBOARD_API_SECRET ?? '';

// Monate Aug 2026 – Jul 2027 (12 Einträge, Reihenfolge stabil)
const MONTHS: string[] = [
  '2026-08', '2026-09', '2026-10', '2026-11', '2026-12',
  '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06', '2027-07',
];

const MONTH_LABELS: Record<string, string> = {
  '2026-08': 'Aug 26', '2026-09': 'Sep', '2026-10': 'Okt', '2026-11': 'Nov', '2026-12': 'Dez',
  '2027-01': 'Jan 27', '2027-02': 'Feb', '2027-03': 'Mrz', '2027-04': 'Apr',
  '2027-05': 'Mai', '2027-06': 'Jun', '2027-07': 'Jul',
};

const CATEGORY_LABEL: Record<string, string> = {
  sachmittel: 'Sachmittel',
  coaching: 'Coaching',
};

// Spalte 1 = Label-Spalte; Spalten 2..13 = Monate
function monthColStart(month: string): number {
  return MONTHS.indexOf(month) + 2; // +2 weil Spalte 1 = Label
}

function itemGridSpan(item: PlanningItem): { colStart: number; colEnd: number } | null {
  const validMonths = item.months.filter((m) => MONTHS.includes(m)).sort();
  if (validMonths.length === 0) return null;
  const colStart = monthColStart(validMonths[0]);
  const colEnd = monthColStart(validMonths[validMonths.length - 1]) + 1;
  return { colStart, colEnd };
}

function statusColor(status: PlanningItem['status'], category: PlanningItem['category']): string {
  if (status === 'done') return 'bg-[var(--ok)] opacity-90';
  if (status === 'partial') return 'bg-[var(--warn)] opacity-90';
  return category === 'sachmittel'
    ? 'bg-[var(--brand-2)] opacity-80'
    : 'bg-[var(--brand-1)] opacity-80';
}

function PlanBar({ item }: { item: PlanningItem }) {
  const span = itemGridSpan(item);
  if (!span) return null;

  return (
    <div
      className="contents"
      role="row"
      aria-label={`${item.name}: ${formatEur(item.amount_eur_total)}`}
    >
      {/* Label-Zelle */}
      <div
        className="flex items-center gap-1.5 py-1 font-[var(--font)] text-[11.5px] text-[var(--ink-2)]"
        style={{ gridColumn: '1' }}
      >
        {item.is_critical && (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--danger)]" aria-label="kritisch" />
        )}
        <span className="truncate">{item.name}</span>
        <span className="ml-auto shrink-0 font-[var(--mono)] text-[10px] text-[var(--ink-3)]">
          {formatEur(item.amount_eur_total)}
        </span>
      </div>

      {/* Bar-Zelle */}
      <div
        className={`mx-0.5 my-0.5 flex items-center rounded-[6px] px-2 py-1 ${statusColor(item.status, item.category)}`}
        style={{ gridColumn: `${span.colStart} / ${span.colEnd}` }}
        aria-hidden
      >
        {item.amount_eur_per_month && (
          <span className="font-[var(--mono)] text-[9.5px] text-white/70">
            {formatEur(item.amount_eur_per_month)}/Mon.
          </span>
        )}
      </div>
    </div>
  );
}

function CategorySection({
  label,
  items,
  totalBudget,
}: {
  label: string;
  items: PlanningItem[];
  totalBudget: number;
}) {
  const plannedTotal = items.reduce((s, i) => s + i.amount_eur_total, 0);

  return (
    <>
      {/* Kategorie-Header */}
      <div
        className="col-span-full flex items-center gap-2 border-t border-[var(--line-1)] pb-1 pt-3"
        style={{ gridColumn: '1 / -1' }}
      >
        <span className="font-[var(--mono)] text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
          {label}
        </span>
        <span className="font-[var(--mono)] text-[11px] text-[var(--ink-3)]">
          {formatEur(plannedTotal)} / {formatEur(totalBudget)}
        </span>
      </div>

      {items.map((item) => (
        <PlanBar key={item.id} item={item} />
      ))}
    </>
  );
}

export function ExistPlanningTimeline() {
  const [data, setData] = useState<PlanningData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/finance/planning', {
      headers: { Authorization: `Bearer ${SECRET}` },
      cache: 'no-store',
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<PlanningData>;
      })
      .then((payload) => { if (!cancelled) { setData(payload); setError(null); } })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Fehler'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return <p className="py-6 text-[13px] text-[var(--ink-3)]">Lade Planung …</p>;
  }
  if (error || !data) {
    return (
      <p className="py-6 text-[13px] text-[var(--danger)]">
        Planung nicht verfügbar: {error ?? 'Unbekannter Fehler'}
      </p>
    );
  }

  const sachmittelItems = data.items.filter((i) => i.category === 'sachmittel');
  const coachingItems = data.items.filter((i) => i.category === 'coaching');

  // CSS Grid: 1 Label-Spalte + 12 Monats-Spalten
  const gridCols = `minmax(160px, 220px) repeat(12, 1fr)`;

  return (
    <section className="company-section" aria-label="EXIST Planungsübersicht">
      <h2 className="company-section-title">Planung Aug 2026 – Jul 2027</h2>
      <p className="company-section-sub">
        Geplante EXIST-Ausgaben nach Monat. Rot = kritischer Posten.
        <span className="ml-2 font-[var(--mono)] text-[10px] text-[var(--ink-3)]">
          Quelle: Sachmittelplanung_v12 · Coachingplanung_v12 (Platzhalter)
        </span>
      </p>

      {/* Legende */}
      <div className="mb-4 flex flex-wrap items-center gap-4 font-[var(--mono)] text-[11px] text-[var(--ink-3)]">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-sm bg-[var(--brand-2)] opacity-80" />
          Sachmittel (geplant)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-sm bg-[var(--brand-1)] opacity-80" />
          Coaching (geplant)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-sm bg-[var(--ok)] opacity-90" />
          erledigt
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-sm bg-[var(--warn)] opacity-90" />
          teilweise
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--danger)]" />
          kritisch
        </span>
      </div>

      {/* Timeline Grid */}
      <div
        className="overflow-x-auto rounded-[14px] border border-[var(--line-1)] bg-white/[0.02] p-3"
        role="grid"
        aria-label="Planungs-Timeline"
      >
        <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: '0 2px', minWidth: '700px' }}>
          {/* Monats-Header */}
          <div style={{ gridColumn: '1' }} className="py-1" />
          {MONTHS.map((m, idx) => (
            <div
              key={m}
              style={{ gridColumn: `${idx + 2}` }}
              className="py-1 text-center font-[var(--mono)] text-[10px] font-semibold text-[var(--ink-3)]"
            >
              {MONTH_LABELS[m]}
            </div>
          ))}

          {/* Kategorie: Sachmittel */}
          <CategorySection
            label={CATEGORY_LABEL.sachmittel}
            items={sachmittelItems}
            totalBudget={30_000}
          />

          {/* Kategorie: Coaching */}
          <CategorySection
            label={CATEGORY_LABEL.coaching}
            items={coachingItems}
            totalBudget={5_000}
          />
        </div>
      </div>

      <p className="mt-2 font-[var(--mono)] text-[10px] text-[var(--ink-3)]">
        Stand: {new Date(data.generated_at).toLocaleDateString('de-DE')} · read-only
      </p>
    </section>
  );
}
```

- [ ] **Schritt 2: TypeScript-Check**

```bash
cd /Users/felixmagiera/conductor/workspaces/kalkulai-team-os/bucharest
npx tsc --noEmit
```

Erwartet: keine neuen Fehler.

- [ ] **Schritt 3: Commit**

```bash
git add components/finance/ExistPlanningTimeline.tsx
git commit -m "feat(finance): ExistPlanningTimeline component (Gantt-style, CSS Grid)"
```

---

## Task 6: Dritter Tab in CompanyPageClient

**Files:**
- Modify: `app/dashboard/company/CompanyPageClient.tsx`

Drei Änderungen: (1) `FinanceScenarioMode` um `'exist-planung'` erweitern, (2) dritten Tab-Button hinzufügen, (3) `ExistPlanningTimeline` importieren und im Render-Zweig anzeigen.

- [ ] **Schritt 1: Import ergänzen**

Suche in der Datei nach der Zeile:
```typescript
import { ExistCockpit } from '@/components/finance/ExistCockpit';
```

Ersetze sie durch:
```typescript
import { ExistCockpit } from '@/components/finance/ExistCockpit';
import { ExistPlanningTimeline } from '@/components/finance/ExistPlanningTimeline';
```

- [ ] **Schritt 2: Type erweitern**

Suche:
```typescript
type FinanceScenarioMode = 'pre-exist' | 'exist';
```

Ersetze durch:
```typescript
type FinanceScenarioMode = 'pre-exist' | 'exist' | 'exist-planung';
```

- [ ] **Schritt 3: Dritten Tab-Button einfügen**

Suche im JSX die beiden bestehenden Buttons (Ende des zweiten Buttons):
```tsx
              onClick={() => setFinanceScenario('exist')}
            >
              EXIST-CFO
            </button>
```

Direkt dahinter (vor dem schließenden `</div>` des Button-Containers) einfügen:
```tsx
              <button
                type="button"
                className={`rounded-[10px] px-3 py-2 font-[var(--mono)] text-[11px] font-semibold transition ${
                  financeScenario === 'exist-planung'
                    ? 'bg-[var(--glass-2)] text-[var(--ink-1)] shadow-[0_0_12px_-6px_var(--brand-2)]'
                    : 'text-[var(--ink-3)] hover:text-[var(--ink-1)]'
                }`}
                aria-pressed={financeScenario === 'exist-planung'}
                onClick={() => setFinanceScenario('exist-planung')}
              >
                EXIST-Planung
              </button>
```

- [ ] **Schritt 4: Render-Zweig für Planung ergänzen**

Suche:
```tsx
          {financeScenario === 'pre-exist' ? (
            <FinanceSection data={finance} loading={financeLoading} error={financeError} />
          ) : (
            <ExistCockpit />
          )}
```

Ersetze durch:
```tsx
          {financeScenario === 'pre-exist' ? (
            <FinanceSection data={finance} loading={financeLoading} error={financeError} />
          ) : financeScenario === 'exist' ? (
            <ExistCockpit />
          ) : (
            <ExistPlanningTimeline />
          )}
```

- [ ] **Schritt 5: TypeScript-Check**

```bash
cd /Users/felixmagiera/conductor/workspaces/kalkulai-team-os/bucharest
npx tsc --noEmit
```

Erwartet: keine neuen Fehler.

- [ ] **Schritt 6: Build-Check**

```bash
cd /Users/felixmagiera/conductor/workspaces/kalkulai-team-os/bucharest
npx next build 2>&1 | tail -20
```

Erwartet: Erfolgreicher Build ohne neue Fehler.

- [ ] **Schritt 7: Alle Tests**

```bash
cd /Users/felixmagiera/conductor/workspaces/kalkulai-team-os/bucharest
npx vitest run
```

Erwartet: alle Tests grün, inkl. die neuen finance-planning-api Tests.

- [ ] **Schritt 8: Commit**

```bash
git add app/dashboard/company/CompanyPageClient.tsx
git commit -m "feat(finance): add EXIST-Planung tab to company finance view (closes KAL-XX)"
```

---

## Self-Review

### Spec-Coverage-Check

| Anforderung | Task |
|---|---|
| Dritte Unteransicht in Finance/EXIST | Task 6 (Tab-Button + Render-Zweig) |
| Timeline als Standardansicht | Task 5 (ExistPlanningTimeline ist die einzige View) |
| Aug 2026 – Jul 2027 Monate | Task 2 (MONTHS-Konstante) + Task 5 (MONTHS im Client) |
| Trennung Sachmittel / Coaching | Task 2 (category), Task 5 (CategorySection) |
| Einmalige Posten als einzelne Punkte/Blöcke | Task 5 (PlanBar: 1-Monats-Span) |
| Laufende Posten als Balken | Task 5 (PlanBar: multi-Monats-Span + amount_eur_per_month) |
| Farbliche Trennung Sachmittel/Coaching | Task 5 (statusColor + Legende) |
| Markierung kritisch | Task 5 (is_critical → roter Dot) |
| Read-only Phase 1 | Task 5 (keine Edit-Controls) |
| Kein Vermischen Plan/Ist | Task 6 (separater Tab, kein Merge mit ExistCockpit) |
| Vorbereitung Plan-vs-Ist | Task 1 (status-Feld), API erweiterbar mit actual_eur |
| Robuste Architektur für Änderungen | Task 2 (statische Daten isoliert, leicht austauschbar) |
| Herkunftshinweis auf v12 | Task 5 (source label in UI) |

**Fehlend:** Kalenderansicht — bewusst Phase 2 (explizit im Spec: „später optional").

### Placeholder-Scan

Keine unvollständigen Schritte. Alle Codeblöcke sind vollständig und ausführbar.

### Typ-Konsistenz

- `PlanningItem.category` überall `'sachmittel' | 'coaching'` (kein Drift).
- `PlanningStatus` überall `'planned' | 'done' | 'partial'`.
- `MONTHS`-Array in `lib/exist-planning-data.ts` und `ExistPlanningTimeline.tsx` identisch (Aug 2026–Jul 2027).
- `formatEur` aus `@/lib/finance-format` — kein lokaler Re-implement.

---

## Was absichtlich fehlt

- **Kein DB-Modell für Planung** — statische Daten in Phase 1 reichen; Phase 2 kann Migration + `planning_items`-Tabelle ergänzen, wenn Google-Sheets-Sync ausgebaut wird.
- **Kein Kalender-View** — explizit Phase 2 laut Spec.
- **Keine Edit-Controls** — Phase 1 ist read-only.
- **Kein Plan-vs-Ist-Vergleich** — Architektur (status-Feld, separater Tab) bereitet es vor; Daten-Join kommt in Phase 2.

---

> **Hinweis für v12-Daten:** Nach Implementierung die Posten in `lib/exist-planning-data.ts` mit den echten Zeilen aus Sachmittelplanung_v12 und Coachingplanung_v12 befüllen. Der Summen-Test (Task 4) stellt sicher, dass 30.000 € / 5.000 € nicht versehentlich verändert werden.
