# EXIST Finance — Expense-Ledger + Operatives Cockpit

**Datum:** 2026-06-22
**Status:** Design freigegeben (Brainstorming abgeschlossen, 6 Fragen geklärt)
**Scope:** TeamOS wird operatives EXIST-Finance-OS. Pre-EXIST bleibt **unangetastet**.

---

## 1. Zielbild & Architekturentscheidung

TeamOS soll Shared Finance Truth werden. Heute fließt Finance **Sheets → `finance_snapshots` → Anzeige** (snapshot-only, präsentations-geformt). EXIST braucht aber **operative Steuerung** (Vorstreckungen, Topfverbrauch, Erstattungsstatus) — dafür reichen Präsentations-Blobs nicht.

**Entscheidung: „beides, sauber getrennt".**

| Schicht | Truth-Quelle | Status |
|---|---|---|
| Pre-EXIST (`scenario='current'`) | Sheets → `finance_snapshots` → `FinanceData` | **unangetastet** |
| EXIST Plan/Forecast | `finance_snapshots` (`scenario='exist'`) | bleibt ergänzend |
| EXIST **Budget** (Topfgrößen) | `lib/exist-budget.ts` (Förderbescheid-Konstanten) | NEU |
| EXIST **operative Ist-Wahrheit** | `finance_expenses` (Rohzeilen) + serverseitige Aggregation | NEU |

EXIST ist **kein Unterfilter** von Pre-EXIST, sondern ein eigener operativer Modus mit eigener Truth-Quelle. Die EXIST-UI führt **Budget (Plan) + Realität (Ledger)** zusammen: `remaining = budget(const) − spent(ledger)`.

### Harte Vorgabe (Regression-Schutz)
`GET /api/finance`, `POST /api/finance/snapshot`, `FinanceData`, das `current/exist`-Snapshot-Rendering und `lib/finance-sync.ts` werden **nicht angefasst**. Erfolgskriterium „Pre-EXIST bleibt stabil" gilt als verletzt, sobald eine dieser Dateien geändert wird.

---

## 2. Datenmodell — `finance_expenses` (Migration 031)

Neue Tabelle. **Snapshot-Struktur NICHT verbiegen, `FinanceData` NICHT aufblasen.**

```sql
-- supabase/migrations/031_finance_expenses.sql
create table if not exists finance_expenses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  expense_date date not null,
  vendor text not null,
  description text not null,
  category text,
  amount_eur numeric(12,2) not null,

  paid_by text not null,            -- team_members.id (uuid-text) wenn legal_entity='private', sonst Entity-Label
  legal_entity text not null default 'private'
    check (legal_entity in ('private','gmbh','chair')),
  scenario text not null default 'exist'
    check (scenario in ('exist','pre-exist')),

  funding_pot text not null default 'unclear'
    check (funding_pot in ('sachmittel','coaching','stipend','non_fundable','unclear')),
  fundability text not null default 'unclear'
    check (fundability in ('fundable','non_fundable','unclear')),
  reimbursable text not null default 'unclear'
    check (reimbursable in ('yes','no','unclear')),
  reimbursement_status text not null default 'open'
    check (reimbursement_status in ('open','submitted','approved','reimbursed','rejected','n_a')),
  receipt_status text not null default 'missing'
    check (receipt_status in ('missing','available')),
  approval_status text not null default 'not_checked'
    check (approval_status in ('not_checked','checked','needs_clarification')),

  source text not null default 'manual_ui'
    check (source in ('hermes','manual_ui','import')),
  source_message text,
  note text,

  idempotency_key text unique          -- nullable; Hermes/Import setzt Hash o. externe ID
);

create index if not exists finance_expenses_scenario_date_idx
  on finance_expenses (scenario, expense_date desc);
create index if not exists finance_expenses_reimb_idx
  on finance_expenses (reimbursement_status);

-- RLS wie Migration 021/010: alles über Next.js-Routes mit Service-Role-Key. Kein anon-Zugriff.
alter table finance_expenses enable row level security;
```

**Feld-Semantik (gelockt):**
- `funding_pot` = **operative** Zuordnung / Buchungsziel.
- `fundability` = **Bewertungs-/Sicherheitsstatus**. Überlappung mit `funding_pot` bewusst belassen; Aggregate (§4) definieren, welches Feld welches KPI treibt.
- `paid_by` = stabile Identität, **kein Freitext**: `team_members.id` bei `legal_entity='private'`, sonst `'GmbH'`/`'Lehrstuhl'`/`'Company'`. Namens-Auflösung passiert in der UI über `/api/members`.
- `scenario` defaultet `'exist'` (am MVP de facto immer EXIST; Spalte zukunftssicher).

**`updated_at`-Trigger** oder im PATCH-Handler setzen (Handler reicht, kein DB-Trigger nötig).

---

## 3. Budget-Konstanten — `lib/exist-budget.ts`

Fixe Summen aus dem Förderbescheid, getypt, klar von Pre-EXIST getrennt, nur für EXIST-Logik.

```ts
export interface ExistBudget {
  sachmittel_total_eur: number;
  coaching_total_eur: number;
  stipend_total_eur: number;
  network_support_total_eur: number; // Betreuungs-/Netzwerkpauschale — SICHTBAR, aber KEIN operativer Founder-Topf
  funding_start: string;             // 'YYYY-MM-DD'
  funding_end: string;
}

const existBudgetConfig: ExistBudget = { /* echte Zahlen aus Förderbescheid einsetzen */ };

export function getExistBudget(): ExistBudget { return existBudgetConfig; }
```

> Helper `getExistBudget()`, damit später B (Snapshot-Block) oder C (Tabelle) leicht austauschbar ist.
> `network_support_total_eur` wird im Cockpit **getrennt gelabelt** angezeigt, fließt **nicht** in Sachmittel/Coaching-Remaining.

---

## 4. Aggregation — `lib/exist-aggregate.ts` (reine Funktion)

Input: `FinanceExpense[]` (nur `scenario='exist'`) + `ExistBudget` + `now: Date`. Output: `ExistFinanceData`. Keine Mutation, keine I/O — testbar.

### Rechenregeln (gelockt)

**Offene Vorstreckung** (Kern): `reimbursable='yes' AND reimbursement_status ∈ (open, submitted, approved)`.
- `pending_reimbursements_eur` = Σ amount — **strikt nur `reimbursable='yes'`** (unclear NICHT, sonst zu optimistisch).
- `open_reimbursement_count` = Anzahl.
- `largest_open_items` = Top 5 nach Betrag, **Tiebreak: älter zuerst** (kleineres `expense_date`).

**Founder-OOP pro Person** (bewusst **breit**): `legal_entity='private' AND reimbursement_status ∉ (reimbursed, n_a)`, gruppiert nach `paid_by`. `unclear` zählt mit (real getragene Cash-Belastung). → `founder_out_of_pocket_by_person[]`.
> Post-MVP-Split vermerkt: `founder_oop_total` vs `founder_oop_reimbursable`.

**Aging** (über `expense_date`): `days_outstanding = floor((now − expense_date) / 1d)` für offene Items.
- `oldest_open_days`, `avg_days_outstanding`, `overdue_reimbursement_count` (= **>30 Tage**).

**Vorstreckungsampel:** 🟢 nichts offen >14d · 🟡 etwas >14d (aber nichts >30d) · 🔴 etwas >30d.

**Topfverbrauch:** `sachmittel_spent_eur` = Σ `funding_pot='sachmittel'`; coaching analog. `*_remaining_eur = total − spent`.

**Bewertung:** `non_fundable_spend_eur` = Σ `funding_pot='non_fundable'`. `unclear_items_count` = Anzahl `funding_pot='unclear' OR fundability='unclear'`.

### Output-Shape

```ts
interface ExpenseSummary {
  id: string; vendor: string; description: string;
  amount_eur: number; expense_date: string; days_outstanding: number;
}

interface ExistFinanceData {
  generated_at: string;            // ISO, serverseitig gestempelt
  as_of: string;                   // Provenienz-Label, z.B. "Ledger live · Budget Förderbescheid · Aug26–Jul27"
  data_origin: 'db' | 'defaults';  // 'db' = Ledger hat ≥1 Zeile; 'defaults' = leeres Ledger (Budgets trotzdem)
  currency: 'EUR';

  budget: ExistBudget;
  pots: {
    sachmittel_spent_eur: number; sachmittel_remaining_eur: number;
    coaching_spent_eur: number;   coaching_remaining_eur: number;
  };
  reimbursements: {
    pending_reimbursements_eur: number;
    open_reimbursement_count: number;
    overdue_reimbursement_count: number;
    avg_days_outstanding: number;
    oldest_open_days: number;
    largest_open_items: ExpenseSummary[];
    ampel: 'green' | 'yellow' | 'red';
  };
  founder_out_of_pocket_by_person: { paid_by: string; amount_eur: number }[];
  non_fundable_spend_eur: number;
  unclear_items_count: number;
}
```

---

## 5. API-Surface

Bearer-Auth (`DASHBOARD_API_SECRET`) wie alle Write-Routes. Boundary-Validierung im Stil von `app/api/finance/snapshot/route.ts` (`isRecord`/`isNum`/`isStr` + Enum-Whitelists). Nie externen Payload vertrauen.

| Route | Zweck | Notizen |
|---|---|---|
| `POST /api/expenses` | Create (Hermes/Import) | validiert; `idempotency_key` → `ON CONFLICT DO NOTHING`. Conflict-Response: `{ created: false, status: 'duplicate_ignored' }`. Erfolg: `{ created: true, expense }`. |
| `GET /api/expenses` | Roh-Ledger-Liste | optional `?scenario` (default exist), Sortierung `expense_date desc` |
| `PATCH /api/expenses/{id}` | Review/Edit | nur gesetzte Felder; v.a. `reimbursement_status`, `fundability`, `funding_pot`, `note`. Setzt `updated_at`. |
| `DELETE /api/expenses/{id}` | manuelles Aufräumen/Dedup | idempotent |
| `GET /api/finance/exist` | Aggregat: Budget + KPIs + Ampel | liefert `ExistFinanceData` inkl. `as_of`, `generated_at`, `data_origin` |

**Unangetastet:** `GET /api/finance`, `POST /api/finance/snapshot`.

---

## 6. UI (PR2) — baut nur auf §4/§5-Contracts auf, keine erneute Datenmodell-Diskussion

Gemountet in `app/dashboard/company/CompanyPageClient.tsx`, neben der bestehenden `FinanceSection`.

- **Modul A — Szenario-Switch:** Toggle `Pre-EXIST (Ist)` | `EXIST / Förderlogik`. Pre-EXIST → bestehende `FinanceSection` (`/api/finance`, unverändert). EXIST → neues `ExistCockpit` (`/api/finance/exist`).
- **Modul C — EXIST-Cockpit:** KPI-Cards + **prominente Vorstreckungsampel** (`components/finance/TrafficLight.tsx` wiederverwenden). Topf-Bars (Sachmittel/Coaching remaining), pending reimbursements + Aging, unclear-count, non-fundable spend. Netzwerkpauschale getrennt gelabelt.
- **Modul B — Shared Expense Ledger:** Liste aus `GET /api/expenses`. Spalten: Datum, Vendor, Beschreibung, Betrag, Zahler, Topf, Förderfähigkeit, Erstattungsstatus, Belegstatus, **`source`-Badge** (hermes/import/manual_ui).
- **Modul D — Founder-Transparenz:** `founder_out_of_pocket_by_person`, Namen via `/api/members`.
- **Modul E — Inline-Edit/Review:** PATCH auf Status/Förderfähigkeit/Topf/Note. **UI-Transparenzhinweis** statt Fake-ACL: „Änderungen sind für alle Founder sichtbar — Status/Förderfähigkeit nur ändern, wenn geprüft."
- **Data Freshness:** `as_of` + `generated_at` + `data_origin` sichtbar; Hinweis bei leerem Ledger.

UX-Priorität (deine Reihenfolge): 1. klare operative Wahrheit · 2. minimale Regression · 3. schnelle Nutzbarkeit · 4. erst danach Eleganz. Klarheit vor Fancy.

---

## 7. Governance (MVP)

- **Capture:** Hermes-first (`source='hermes'`) + Import/CSV-Seed (`source='import'`). **Kein** sichtbares Founder-Create-Form am MVP.
- **Review/Edit:** alle Founder (Leon, Felix, Paul) dürfen bestehende Einträge anpassen. Kein echtes/vorgetäuschtes Admin-Modell.
- **Sichtbarkeit:** alle Founder sehen das EXIST-Cockpit (nicht gated wie Campaigns).

---

## 8. Non-Goals (MVP-Cuts)

Eigene Event-Historie · Attachment-System · Multi-Step-Approval-Engine · perfekte Dedup-Automatik (nur idempotency_key) · DATEV-/Invoice-Sync · manuelles Create-Form · echter Audit-Log / `last_changed_by` · echte Rollen/Permissions · `committed`/`remaining_net` Budget-Logik. Alles Post-MVP.

---

## 9. Build-Plan — 2 PRs

**PR1 — Backend Slice (headless testbar, Pre-EXIST nicht anfassen):**
1. Migration `031_finance_expenses.sql`
2. `types/finance-expense.ts` (FinanceExpense, ExistFinanceData, ExpenseSummary)
3. `lib/exist-budget.ts` (Konstanten + `getExistBudget()`)
4. `lib/exist-aggregate.ts` (reine Aggregations-Funktion, §4)
5. API: `POST/GET/PATCH/DELETE /api/expenses` + `GET /api/finance/exist`
6. **Aggregation-Tests** (Vitest, wie `tests/finance-*.test.ts`): alle 6 Regeln, Ampel-Schwellen, leeres Ledger, idempotency-Conflict
7. CSV-Seed-Script + `docs/AI-OPERATIONS.md`-Update (Hermes-Write-Contract, Phase 5)

**PR2 — UI Slice (baut nur auf PR1-Contracts):**
- Szenario-Switch · ExistCockpit · Ledger-Liste · Inline-Edit · CompanyPage-Integration
- Keine Datenmodell-Diskussion, kein Backend-Touch.

---

## 10. Offene Punkte / später austauschbar

- Budget-Quelle B (Snapshot-Block) / C (Tabelle) statt A (Konstanten) — `getExistBudget()` kapselt den Wechsel.
- `founder_oop_total` vs `_reimbursable` Doppelsicht.
- `committed` → `remaining_net`.
- `largest_open_items` Risiko-Score (Betrag × Alter) statt nur Betrag.
- Aging-Stufen >45d/>60d kritisch.
