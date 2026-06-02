# Build-1 Backlog für Projekt-Steps (nur Felix) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Final location:** Beim Ausführen diesen Plan nach `docs/superpowers/plans/2026-06-02-build1-backlog-felix.md` kopieren (Plan-Mode durfte nur diese Datei schreiben).

**Goal:** Neu angelegte Projekt-Steps von Felix landen nicht mehr direkt im Kanban-„To Do", sondern in einem eigenen, einklappbaren „Build 1"-Backlog-Panel auf dem Board, aus dem Felix sie pro Projekt gezielt mit einem „→ To Do"-Button ins Board holt.

**Architecture:** Wir nutzen die bestehende `kpis.status`-Spalte (Migration 009) und führen einen vierten Wert `'backlog'` ein. Server-seitig bekommen neue Steps von Felix `status='backlog'` als Default (gated über eine Member-Flag, analog zu `lib/campaign-access.ts`). `mergeTasks` blendet Backlog-Steps aus Board- und Listenansicht aus; ein neuer `mergeBacklogTasks`-Pfad speist das Board-Panel. Promotion = `PATCH /api/kpis/{id}` mit `{status:'todo'}` — derselbe Persistenz-Pfad, den Kanban-DnD heute schon nutzt.

**Tech Stack:** Next.js (App Router), TypeScript, Supabase (Postgres), @dnd-kit, Vitest.

---

## Context

Heute werden Projekt-Steps (`kpis`-Rows mit `type='step'`) in `lib/unified-tasks.ts:mergeTasks` zu `UnifiedTask`s gemerged und über `deriveStepStatus` standardmäßig auf `'todo'` gesetzt (bzw. `'in-progress'` wenn überfällig). Dadurch erscheinen sie sofort in der „To Do"-Spalte des Kanban-Boards (`/dashboard/board`) und in der Listenansicht (`/dashboard`). Felix empfindet das als überfordernd: jedes neu geplante Projekt flutet sofort „To Do".

Gewünschtes Verhalten (nur User **Felix**, `c9677ade-e42c-4593-81c6-7a2108b145fd`; Leon & Paul unverändert):
1. Neue Steps landen zuerst in einem „Build 1"-Backlog, **nicht** in To Do.
2. Auf dem Board gibt es ein einklappbares Backlog-Panel mit Projekt-Dropdown; pro Step ein „→ To Do"-Button, der den Step ins Board holt.
3. Einmalig werden alle **offenen, noch nicht gestarteten** Steps von Felix (`type='step'`, `completed=false`, `status` ist `NULL` oder `'todo'`) in den Backlog verschoben. In-Progress/On-Hold-Steps bleiben.

Die `status`-Spalte hat aktuell einen CHECK-Constraint auf `('todo','in-progress','on-hold')` (Migration 009) — der muss erweitert werden.

---

## File Structure

| Datei | Verantwortung | Aktion |
|---|---|---|
| `supabase/migrations/022_kpi_backlog_status.sql` | CHECK-Constraint um `'backlog'` erweitern + einmaliger Backfill für Felix | Create |
| `lib/agent-access.ts` | `FELIX_MEMBER_ID` + `isFelixMemberId` (neben bestehendem Leon) | Modify |
| `lib/backlog-access.ts` | Feature-Flag `backlogEnabledForMember` + reine Default-Logik `defaultStepStatus` | Create |
| `lib/unified-tasks.ts` | `'backlog'` in `UnifiedStatus`; `deriveStepStatus`; `mergeTasks`-Filter; neuer `mergeBacklogTasks` | Modify |
| `lib/kpis.ts` | `createKpi` akzeptiert/persistiert `status`; `updateKpiDefinition`-Typ um `'backlog'` | Modify |
| `app/api/kpis/route.ts` | POST: Step-Default-Status via `defaultStepStatus(user_id)` | Modify |
| `app/api/kpis/[id]/route.ts` | PATCH: `status`-Validierung um `'backlog'` erweitern | Modify |
| `app/dashboard/board/page.tsx` | `backlogTasks` + `backlogEnabled` berechnen und an Board reichen | Modify |
| `components/dashboard/KanbanBoard.tsx` | Backlog-Panel (Dropdown + „→ To Do"-Buttons) + Promote-Handler | Modify |
| `app/globals.css` | Styles für `.kanban-backlog*` | Modify |
| `tests/backlog-access.test.ts` | Unit-Tests für Feature-Flag + Default-Logik | Create |
| `tests/unified-tasks.test.ts` | Tests für `deriveStepStatus`/`mergeTasks`/`mergeBacklogTasks` mit Backlog | Modify |
| `tests/kpis.test.ts` | Test: `createKpi` schreibt `status` in Insert | Modify |

---

## Task 1: DB-Migration — `'backlog'` erlauben + Felix-Backfill

**Files:**
- Create: `supabase/migrations/022_kpi_backlog_status.sql`

- [ ] **Step 1: Migration schreiben**

```sql
-- 022_kpi_backlog_status.sql
-- Vierter Workflow-Status für Projekt-STEPS: 'backlog' (= "Build 1"-Parkplatz,
-- noch nicht auf dem Kanban-Board sichtbar). Nur Felix nutzt diesen Default
-- (Gating in lib/backlog-access.ts), die Spalte selbst bleibt member-agnostisch.
--
-- Migration 009 legte den Constraint inline an → Postgres-Auto-Name 'kpis_status_check'.
-- Falls DROP ein No-Op ist (abweichender Name), Constraint-Name per '\d kpis' prüfen.

alter table kpis drop constraint if exists kpis_status_check;
alter table kpis add constraint kpis_status_check
  check (status is null or status in ('todo', 'in-progress', 'on-hold', 'backlog'));

-- Einmaliger Backfill: alle offenen, noch nicht gestarteten Felix-Steps in den Backlog.
-- 'in-progress'/'on-hold' bleiben unangetastet. NULL & 'todo' = "nicht gestartet".
update kpis
   set status = 'backlog'
 where user_id = 'c9677ade-e42c-4593-81c6-7a2108b145fd'
   and type = 'step'
   and completed = false
   and (status is null or status = 'todo');
```

- [ ] **Step 2: Migration anwenden (lokal/Supabase)**

Run: `supabase db push` (oder projektüblicher Migrations-Befehl; team-os Supabase ref `jtakzjvaxctmnpzsszrf`).
Expected: Migration läuft fehlerfrei; `\d kpis` zeigt den erweiterten CHECK.

- [ ] **Step 3: Backfill verifizieren**

Run:
```sql
select count(*) from kpis
 where user_id = 'c9677ade-e42c-4593-81c6-7a2108b145fd'
   and type = 'step' and status = 'backlog';
```
Expected: Anzahl > 0 (entspricht Felix' offenen, nicht gestarteten Steps).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/022_kpi_backlog_status.sql
git commit -m "feat(kpis): add 'backlog' step status + one-time Felix backfill"
```

---

## Task 2: Member-Gating + Backlog-Feature-Flag

**Files:**
- Modify: `lib/agent-access.ts`
- Create: `lib/backlog-access.ts`
- Test: `tests/backlog-access.test.ts`

- [ ] **Step 1: Test schreiben**

```ts
// tests/backlog-access.test.ts
import { describe, it, expect } from 'vitest';
import { backlogEnabledForMember, defaultStepStatus } from '../lib/backlog-access';

const FELIX = 'c9677ade-e42c-4593-81c6-7a2108b145fd';
const LEON = 'bd695d11-0632-4a0a-b1d0-db43acf46a68';

describe('backlog-access', () => {
  it('enabled only for Felix', () => {
    expect(backlogEnabledForMember(FELIX)).toBe(true);
    expect(backlogEnabledForMember(LEON)).toBe(false);
    expect(backlogEnabledForMember(null)).toBe(false);
    expect(backlogEnabledForMember(undefined)).toBe(false);
  });

  it('new steps default to backlog for Felix, null otherwise', () => {
    expect(defaultStepStatus(FELIX)).toBe('backlog');
    expect(defaultStepStatus(LEON)).toBe(null);
    expect(defaultStepStatus(undefined)).toBe(null);
  });
});
```

- [ ] **Step 2: Test laufen lassen (rot)**

Run: `npx vitest run tests/backlog-access.test.ts`
Expected: FAIL — `Cannot find module '../lib/backlog-access'`.

- [ ] **Step 3: Felix-ID in `lib/agent-access.ts` ergänzen**

```ts
// lib/agent-access.ts (anhängen, bestehenden Leon-Block lassen)
export const FELIX_MEMBER_ID = 'c9677ade-e42c-4593-81c6-7a2108b145fd';

export function isFelixMemberId(memberId: string | null | undefined): boolean {
  return memberId === FELIX_MEMBER_ID;
}
```

- [ ] **Step 4: `lib/backlog-access.ts` anlegen** (Muster: `lib/campaign-access.ts`)

```ts
// lib/backlog-access.ts
import { isFelixMemberId } from '@/lib/agent-access';

/**
 * "Build 1"-Backlog: neu angelegte Projekt-Steps werden geparkt statt sofort
 * im Kanban-Board zu erscheinen. Aktuell nur für Felix aktiv.
 */
export function backlogEnabledForMember(memberId: string | null | undefined): boolean {
  return isFelixMemberId(memberId);
}

/** Default-Status für neu angelegte Steps. 'backlog' wenn Feature aktiv, sonst null (Legacy). */
export function defaultStepStatus(
  memberId: string | null | undefined,
): 'backlog' | null {
  return backlogEnabledForMember(memberId) ? 'backlog' : null;
}
```

- [ ] **Step 5: Test laufen lassen (grün)**

Run: `npx vitest run tests/backlog-access.test.ts`
Expected: PASS (beide Tests).

- [ ] **Step 6: Commit**

```bash
git add lib/agent-access.ts lib/backlog-access.ts tests/backlog-access.test.ts
git commit -m "feat(kpis): Felix backlog feature flag + default-status helper"
```

---

## Task 3: `unified-tasks.ts` — Backlog-Status, Filter, `mergeBacklogTasks`

**Files:**
- Modify: `lib/unified-tasks.ts`
- Test: `tests/unified-tasks.test.ts`

- [ ] **Step 1: Tests schreiben** (an `tests/unified-tasks.test.ts` anhängen — `makeStep`/`makeProject`-Helfer existieren bereits dort)

```ts
import { mergeBacklogTasks } from '../lib/unified-tasks';

describe('backlog steps', () => {
  it('deriveStepStatus returns "backlog" when status=backlog', () => {
    expect(deriveStepStatus(makeStep({ status: 'backlog' }))).toBe('backlog');
  });

  it('mergeTasks excludes backlog steps', () => {
    const steps = [
      makeStep({ id: 's-todo', status: null }),
      makeStep({ id: 's-backlog', status: 'backlog' }),
    ];
    const result = mergeTasks([], steps, [makeProject()]);
    expect(result.map((t) => t.id)).toContain('s-todo');
    expect(result.map((t) => t.id)).not.toContain('s-backlog');
  });

  it('mergeBacklogTasks returns only backlog steps with project info', () => {
    const steps = [
      makeStep({ id: 's-todo', status: null }),
      makeStep({ id: 's-backlog', name: 'Parked', status: 'backlog', parent_id: 'proj-1' }),
    ];
    const result = mergeBacklogTasks(steps, [makeProject('proj-1', 'Testprojekt')]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('s-backlog');
    expect(result[0].status).toBe('backlog');
    expect(result[0].project).toEqual({ id: 'proj-1', name: 'Testprojekt' });
  });
});
```

- [ ] **Step 2: Tests laufen lassen (rot)**

Run: `npx vitest run tests/unified-tasks.test.ts`
Expected: FAIL — `mergeBacklogTasks` ist kein Export; `deriveStepStatus` liefert `'todo'` statt `'backlog'`.

- [ ] **Step 3: `UnifiedStatus` erweitern** (`lib/unified-tasks.ts:5`)

```ts
export type UnifiedStatus = 'todo' | 'in-progress' | 'on-hold' | 'done' | 'backlog';
```

- [ ] **Step 4: `deriveStepStatus` um Backlog ergänzen** (`lib/unified-tasks.ts:31-46`, neuer Zweig direkt nach dem `completed`-Check)

```ts
export function deriveStepStatus(step: KpiWithWeek): UnifiedStatus {
  if (step.completed) return 'done';
  if (step.status === 'backlog') return 'backlog';
  // Persisted Kanban status wins over the auto-derived one.
  if (step.status === 'todo' || step.status === 'in-progress' || step.status === 'on-hold') {
    return step.status;
  }
  if (step.due_date) {
    try {
      const days = differenceInCalendarDays(parseISO(step.due_date), new Date());
      if (days <= 0) return 'in-progress';
    } catch {
      // ignore parse errors
    }
  }
  return 'todo';
}
```

- [ ] **Step 5: `mergeTasks`-Filter erweitern** (`lib/unified-tasks.ts:90`)

```ts
    .filter((t) => t.status !== 'done' && t.status !== 'backlog')
```

- [ ] **Step 6: `mergeBacklogTasks` hinzufügen** (neue Export-Funktion, Muster wie `mergeDoneTasks`)

```ts
export function mergeBacklogTasks(
  steps: KpiWithWeek[],
  projects: KpiWithWeek[],
): UnifiedTask[] {
  const projectMap = new Map(projects.map((p) => [p.id, p.name]));
  return steps
    .filter((s) => s.type === 'step' && !s.completed && s.status === 'backlog')
    .map((step) => ({
      id: step.id,
      kind: 'step' as const,
      title: step.name,
      status: 'backlog' as UnifiedStatus,
      dueDate: step.due_date,
      project: step.parent_id
        ? { id: step.parent_id, name: projectMap.get(step.parent_id) ?? 'Projekt' }
        : null,
    }))
    .sort((a, b) => {
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return a.title.localeCompare(b.title);
    });
}
```

- [ ] **Step 7: Tests laufen lassen (grün)**

Run: `npx vitest run tests/unified-tasks.test.ts`
Expected: PASS (alle, inkl. der drei neuen).

- [ ] **Step 8: Commit**

```bash
git add lib/unified-tasks.ts tests/unified-tasks.test.ts
git commit -m "feat(board): backlog status in unified-tasks + mergeBacklogTasks"
```

---

## Task 4: `createKpi`/POST-Default + PATCH-Validierung

**Files:**
- Modify: `lib/kpis.ts` (`createKpi` ~177-214, `updateKpiDefinition`-Typ ~252)
- Modify: `app/api/kpis/route.ts` (POST)
- Modify: `app/api/kpis/[id]/route.ts` (PATCH-Validierung)
- Test: `tests/kpis.test.ts`

- [ ] **Step 1: Test schreiben** (an `tests/kpis.test.ts` im `describe('createKpi')`-Block; `insertPayloads` wird vom Mock befüllt)

```ts
it('persists status when provided (backlog step)', async () => {
  // maxRow (position) + insert(kpi).select().single()
  responses.push({ data: { position: 0 } });
  responses.push({ data: { id: 'k1', type: 'step', status: 'backlog' } });
  await createKpi({
    user_id: USER, name: 'Step', week_start: WEEK,
    type: 'step', parent_id: 'p1', status: 'backlog',
  });
  const stepInsert = insertPayloads.find((p) => p.type === 'step');
  expect(stepInsert?.status).toBe('backlog');
});
```

- [ ] **Step 2: Test laufen lassen (rot)**

Run: `npx vitest run tests/kpis.test.ts -t "persists status"`
Expected: FAIL — `status` ist nicht im Insert-Payload (`createKpi` ignoriert das Feld).

- [ ] **Step 3: `createKpi` erweitern** (`lib/kpis.ts:177-214`)

Input-Typ um `status` ergänzen:
```ts
export async function createKpi(input: {
  user_id: string;
  parent_id?: string | null;
  name: string;
  unit?: string;
  target?: number;
  week_start: string;
  type?: KpiType;
  due_date?: string | null;
  source?: KpiSource;
  status?: 'todo' | 'in-progress' | 'on-hold' | 'backlog' | null;
}): Promise<KpiWithWeek> {
```

Insert-Objekt um `status` ergänzen (nur sinnvoll für Steps; counter/project ignorieren es ohnehin):
```ts
    .insert({
      user_id: input.user_id,
      parent_id: input.parent_id ?? null,
      name: input.name,
      unit: input.unit ?? '',
      position: nextPosition,
      type,
      due_date: input.due_date ?? null,
      source,
      status: type === 'step' ? (input.status ?? null) : null,
    })
```

- [ ] **Step 4: `updateKpiDefinition`-Typ erweitern** (`lib/kpis.ts:252`)

```ts
    status?: 'todo' | 'in-progress' | 'on-hold' | 'backlog' | null;
```

- [ ] **Step 5: POST-Route Default setzen** (`app/api/kpis/route.ts`, im POST-Handler)

Import ergänzen und `status` an `createKpi` durchreichen:
```ts
import { defaultStepStatus } from '@/lib/backlog-access';
// ...
  const kpi = await createKpi({
    user_id: body.user_id,
    parent_id: body.parent_id ?? null,
    name: body.name.trim(),
    unit: typeof body.unit === 'string' ? body.unit.trim() : '',
    target,
    week_start: currentWeekStart(),
    type,
    due_date,
    source,
    status: type === 'step' ? defaultStepStatus(body.user_id) : null,
  });
```

- [ ] **Step 6: PATCH-Validierung erweitern** (`app/api/kpis/[id]/route.ts`, `status`-Block)

`defPatch.status`-Typ und Validierung um `'backlog'` ergänzen:
```ts
  const defPatch: {
    name?: string;
    unit?: string;
    parent_id?: string | null;
    due_date?: string | null;
    completed?: boolean;
    status?: 'todo' | 'in-progress' | 'on-hold' | 'backlog' | null;
  } = {};
  // ...
  if ('status' in body) {
    if (
      body.status === null || body.status === 'todo' || body.status === 'in-progress' ||
      body.status === 'on-hold' || body.status === 'backlog'
    ) {
      defPatch.status = body.status;
    } else {
      return NextResponse.json(
        { error: 'status must be todo|in-progress|on-hold|backlog|null' },
        { status: 400 },
      );
    }
  }
```

- [ ] **Step 7: Tests laufen lassen (grün)**

Run: `npx vitest run tests/kpis.test.ts`
Expected: PASS (inkl. neuem „persists status").

- [ ] **Step 8: Commit**

```bash
git add lib/kpis.ts app/api/kpis/route.ts app/api/kpis/[id]/route.ts tests/kpis.test.ts
git commit -m "feat(kpis): new Felix steps default to backlog; allow backlog in PATCH"
```

---

## Task 5: Board-Page reicht `backlogTasks` + `backlogEnabled` durch

**Files:**
- Modify: `app/dashboard/board/page.tsx`

- [ ] **Step 1: Imports ergänzen** (`app/dashboard/board/page.tsx:5-6`)

```ts
import { mergeTasks, mergeDoneTasks, mergeBacklogTasks } from '@/lib/unified-tasks';
import { backlogEnabledForMember } from '@/lib/backlog-access';
```

- [ ] **Step 2: Backlog berechnen** (nach `const doneTasks = ...`, ~Zeile 54)

```ts
  const backlogEnabled = backlogEnabledForMember(me.id);
  const backlogTasks = backlogEnabled ? mergeBacklogTasks(steps, projects) : [];
```

> Hinweis: `steps` (= `allKpis.filter(type==='step' && !completed)`) enthält Backlog-Steps bereits; `mergeTasks` filtert sie jetzt raus, `mergeBacklogTasks` zieht genau sie heraus.

- [ ] **Step 3: Props ans Board reichen** (`<KanbanBoard ... />`, ~Zeile 71)

```tsx
      <KanbanBoard
        tasks={tasks}
        doneTasks={doneTasks}
        backlogTasks={backlogTasks}
        backlogEnabled={backlogEnabled}
        members={members}
        activeClaudeByIdentifier={activeClaudeByIdentifier}
      />
```

- [ ] **Step 4: Commit** (zusammen mit Task 6 sinnvoll, da Props erst dann konsumiert werden)

---

## Task 6: KanbanBoard — Backlog-Panel + Promote-Handler

**Files:**
- Modify: `components/dashboard/KanbanBoard.tsx`

- [ ] **Step 1: Props-Signatur erweitern** (`KanbanBoard`-Funktion, ~201-213)

```tsx
export function KanbanBoard({
  tasks: initialTasks,
  doneTasks: initialDone = [],
  backlogTasks: initialBacklog = [],
  backlogEnabled = false,
  members = [],
  activeClaudeByIdentifier,
}: {
  tasks: UnifiedTask[];
  doneTasks?: UnifiedTask[];
  backlogTasks?: UnifiedTask[];
  backlogEnabled?: boolean;
  members?: Array<{ id: string; name: string }>;
  activeClaudeByIdentifier?: Record<string, ClaudeSession[]>;
}) {
```

- [ ] **Step 2: State + abgeleitete Projektliste** (bei den übrigen `useState`-Hooks, ~216-219)

```tsx
  const [backlog, setBacklog] = useState(initialBacklog);
  const [backlogOpen, setBacklogOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
```

Direkt vor dem `return` ableiten:
```tsx
  const backlogProjects = Array.from(
    new Map(
      backlog
        .filter((t) => t.project)
        .map((t) => [t.project!.id, t.project!.name] as const),
    ).entries(),
  ).map(([id, name]) => ({ id, name }));

  const visibleBacklog =
    selectedProjectId === 'all'
      ? backlog
      : backlog.filter((t) => t.project?.id === selectedProjectId);
```

- [ ] **Step 3: Promote-Handler** (neben `handleDragEnd`)

```tsx
  async function promoteToTodo(taskId: string) {
    const task = backlog.find((t) => t.id === taskId);
    if (!task) return;
    const prevBacklog = backlog;
    const prevTasks = tasks;
    // Optimistic: aus Backlog raus, als To-Do ins Board.
    setBacklog((prev) => prev.filter((t) => t.id !== taskId));
    setTasks((prev) => [{ ...task, status: 'todo' as UnifiedStatus }, ...prev]);
    try {
      const res = await fetch(`/api/kpis/${encodeURIComponent(taskId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET}` },
        body: JSON.stringify({ completed: false, status: 'todo' }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
      }
      router.refresh();
    } catch (err) {
      console.error('[Kanban] promote failed, rolling back', err);
      setBacklog(prevBacklog);
      setTasks(prevTasks);
    }
  }
```

- [ ] **Step 4: Panel rendern** (innerhalb der zurückgegebenen JSX, **vor** `<div className="kanban-grid">`, aber innerhalb `<DndContext>` ist nicht nötig — Panel kann oberhalb des DndContext oder oberhalb des Grids stehen; einfachste Variante: direkt vor `<div className="kanban-grid">`)

```tsx
        {backlogEnabled && (
          <div className="kanban-backlog">
            <button
              type="button"
              className="kanban-backlog-toggle"
              onClick={() => setBacklogOpen((v) => !v)}
              aria-expanded={backlogOpen}
            >
              <span className="kanban-col-title">Build 1 · Backlog</span>
              {backlog.length > 0 && (
                <span className="kanban-col-count mono">{backlog.length}</span>
              )}
              <span className="kanban-backlog-chevron">{backlogOpen ? '▾' : '▸'}</span>
            </button>
            {backlogOpen && (
              <div className="kanban-backlog-body">
                {backlog.length === 0 ? (
                  <p className="kanban-empty">Backlog leer</p>
                ) : (
                  <>
                    <select
                      className="kanban-backlog-select"
                      value={selectedProjectId}
                      onChange={(e) => setSelectedProjectId(e.target.value)}
                    >
                      <option value="all">Alle Projekte</option>
                      {backlogProjects.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <div className="kanban-backlog-list">
                      {visibleBacklog.map((task) => (
                        <div key={task.id} className="kanban-backlog-item">
                          <div className="kanban-backlog-item-text">
                            {task.project && (
                              <span className="kanban-card-project">{task.project.name}</span>
                            )}
                            <span className="kanban-card-title">{task.title}</span>
                          </div>
                          <button
                            type="button"
                            className="kanban-backlog-promote"
                            onClick={() => promoteToTodo(task.id)}
                            title="In To Do verschieben"
                          >
                            → To Do
                          </button>
                        </div>
                      ))}
                      {visibleBacklog.length === 0 && (
                        <p className="kanban-empty">Keine Tasks in diesem Projekt</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
```

> `ArrowUp`/`Plus`/`X` werden bereits importiert; für den Promote-Button reicht Text „→ To Do" — kein neues Icon nötig. Falls Icon gewünscht: `ArrowUp` ist schon importiert.

- [ ] **Step 5: Verifizieren, dass kein Typfehler entsteht**

Run: `npx tsc --noEmit`
Expected: keine Fehler in `KanbanBoard.tsx`/`board/page.tsx`.

- [ ] **Step 6: Commit** (Task 5 + 6 zusammen)

```bash
git add app/dashboard/board/page.tsx components/dashboard/KanbanBoard.tsx
git commit -m "feat(board): Build-1 backlog panel with per-project promote-to-todo"
```

---

## Task 7: Styles für das Backlog-Panel

**Files:**
- Modify: `app/globals.css` (im `kanban-*`-Block, nach Zeile ~1552)

- [ ] **Step 1: CSS ergänzen** (Variablen `--ink-1/2/3`, `--brand` existieren bereits im Theme)

```css
.kanban-backlog { margin-bottom: 16px; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; background: rgba(255,255,255,0.02); }
.kanban-backlog-toggle { display: flex; align-items: center; gap: 8px; width: 100%; padding: 10px 12px; background: none; border: none; cursor: pointer; color: var(--ink-2); }
.kanban-backlog-chevron { margin-left: auto; font-size: 11px; color: var(--ink-3); }
.kanban-backlog-body { padding: 0 12px 12px; }
.kanban-backlog-select { margin-bottom: 10px; padding: 5px 8px; font-size: 12px; color: var(--ink-1); background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 7px; }
.kanban-backlog-list { display: flex; flex-direction: column; gap: 7px; }
.kanban-backlog-item { display: flex; align-items: center; gap: 10px; padding: 8px 10px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07); border-radius: 8px; }
.kanban-backlog-item-text { flex: 1; min-width: 0; }
.kanban-backlog-promote { flex-shrink: 0; font-size: 11px; font-weight: 600; padding: 4px 9px; color: var(--brand); background: rgba(91,140,255,0.1); border: 1px solid rgba(91,140,255,0.25); border-radius: 7px; cursor: pointer; white-space: nowrap; }
.kanban-backlog-promote:hover { background: rgba(91,140,255,0.18); }
```

- [ ] **Step 2: Commit**

```bash
git add app/globals.css
git commit -m "style(board): backlog panel styling"
```

---

## Task 8: End-to-End-Verifikation

- [ ] **Step 1: Volle Test-Suite**

Run: `npm test`
Expected: alle Tests grün (inkl. `backlog-access`, `unified-tasks`, `kpis`).

- [ ] **Step 2: Typecheck + Build**

Run: `npx tsc --noEmit && npm run build`
Expected: kein Typfehler, Build erfolgreich.

- [ ] **Step 3: Manuelle Verifikation (Board, Felix)**

1. Dev-Server starten (`npm run dev`), als Member **Felix** auf `/dashboard/board?member=c9677ade-e42c-4593-81c6-7a2108b145fd`.
2. Erwartung: „To Do" ist deutlich leerer; das „Build 1 · Backlog"-Panel zeigt die offenen Steps.
3. Panel aufklappen → Projekt im Dropdown wählen → Steps des Projekts erscheinen.
4. „→ To Do" klicken → Step verschwindet aus dem Backlog und erscheint sofort in der To-Do-Spalte; nach Refresh bleibt er dort (`status='todo'` persistiert).
5. Über „Build 2" (`/settings`, KpiManager) ein neues Projekt + Step anlegen → der Step taucht **nicht** in To Do auf, sondern im Backlog-Panel.

- [ ] **Step 4: Regression Leon/Paul**

Als Leon (`bd695d11-…`) auf `/dashboard/board` → **kein** Backlog-Panel; neu angelegte Steps erscheinen wie bisher direkt in To Do. API-Smoke:
```bash
curl -s -X POST "$BASE/api/kpis" -H "Authorization: Bearer $DASHBOARD_API_SECRET" -H "Content-Type: application/json" \
  -d '{"user_id":"bd695d11-0632-4a0a-b1d0-db43acf46a68","type":"step","parent_id":"<leon-proj-id>","name":"Smoke"}' | jq '.status'
```
Expected: `null` (Leon → kein Backlog-Default). Für Felix dieselbe Anfrage → `"backlog"`.

- [ ] **Step 5: Abschluss-Commit / PR**

```bash
git push -u origin <branch>
gh pr create --base master --title "feat(board): Build-1 Backlog für Projekt-Steps (Felix)" --body "..."
```

---

## Self-Review

- **Spec-Coverage:** (1) Default-Backlog für neue Felix-Steps → Task 4. (2) Backlog-Panel mit Projekt-Dropdown + „→ To Do"-Button → Task 6. (3) Einmaliger Backfill offener/nicht-gestarteter Steps → Task 1. (4) Leon/Paul unangetastet → Gating in Task 2, member-bedingte Berechnung in Task 5. ✓
- **Aus Board & Liste ausgeblendet:** `mergeTasks`-Filter (Task 3, Step 5) greift für `/dashboard/board` **und** `/dashboard` (beide nutzen `mergeTasks`). ✓
- **Typkonsistenz:** `UnifiedStatus` enthält `'backlog'`; `deriveStepStatus`, `mergeBacklogTasks`, `KanbanBoard`-Props, `createKpi`/`updateKpiDefinition`-Typen und API-Validierung verwenden durchgängig `'todo'|'in-progress'|'on-hold'|'backlog'|null`. ✓
- **Keine Placeholder:** alle Steps enthalten konkreten Code/Befehle. ✓
- **Constraint-Risiko:** Falls `DROP CONSTRAINT IF EXISTS kpis_status_check` ein No-Op ist (abweichender Auto-Name), Name per `\d kpis` ermitteln und in der Migration anpassen — als Hinweis in Task 1 dokumentiert.
