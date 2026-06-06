# Task-Metadaten & Edit-Modal (Felix-only) — Design

**Datum:** 2026-06-06
**Status:** Approved (Brainstorming)
**Ziel (North Star):** Kai (Hermes) kennt die Tasks strukturiert genug, um getimeboxte Tage vorzuplanen. Dieser Schritt liefert die **Felder** + **Edit-UX**; das strukturierte Planen ist Phase 2/3.

## Scope-Entscheidungen (gelockt)
- **B) Alles bleibt Linear-Issue.** `privat/geschäftlich` ist ein Metadaten-Flag, kein separater Speicher. (Felix mischt Privates ohnehin in Linear.)
- **Eisenhower ersetzt die 1D-Prio-Chips** (nur für Felix): zwei Toggles `Wichtig` × `Dringend` → Quadrant. Quadrant wird auf Linear-`priority` gemappt (Q1→1, Q2→2, Q3→3, Q4→4), damit Briefing/Sortierung unverändert weiterlaufen.
- **Nur für Felix** sichtbar/aktiv via `isFelixMemberId` (Pattern wie `backlogEnabledForMember`).

## Felder (in `task_meta`)
| Feld | Typ | Werte | Treibt |
|---|---|---|---|
| `context` | text | `business` \| `private` | Filter/Sicht |
| `effort_minutes` | int | 15/30/60/120/240/480 | Timebox-Länge |
| `important` | bool | — | Eisenhower |
| `urgent` | bool | — | Eisenhower |
| `energy` | text | `deep` \| `admin` | Block-Typ |
| `project_id` | uuid | → `kpis.id` (type=project) | Zuordnung |
| `fixed` | bool | termingebunden | Planung |

## Architektur
- **DB:** Neue Migration `023_task_meta.sql` (team-os Supabase `jtakzjvaxctmnpzsszrf`), Vorbild `task_links`. PK `id`, `linear_issue_id text unique`, `user_id uuid`, obige Felder, `created_at/updated_at`. Linear bleibt Source-of-Truth für Titel/Status/Deadline/Priority.
- **Lib:** `lib/task-meta.ts` — `getTaskMeta(ids[])`, `upsertTaskMeta(linearIssueId, userId, patch)`. Mapping `quadrant→priority` in `lib/task-meta.ts`.
- **API:**
  - `POST /api/tasks/create` — nimmt optional `meta`-Block, schreibt task_meta nach Issue-Create + mappt Priority.
  - `PATCH /api/tasks/[id]` — erweitert: nimmt `meta`-Block (upsert task_meta) zusätzlich zu title/dueDate.
  - `GET /api/tasks/meta?userId=` — liefert `Record<linearIssueId, TaskMeta>` für die Board-Hydration. (Cookie-auth via `requireActor`, wie die anderen Routen.)
- **Board-Hydration:** `app/dashboard/board/page.tsx` + `app/dashboard/page.tsx` laden task_meta für die sichtbaren Issue-IDs (nur wenn Felix), reichen `metaByIssueId` + `projects` + `metaEnabled` an `KanbanBoard`.
- **UI (geteilt):** `components/dashboard/TaskMetaFields.tsx` — die Controls (Kontext, Aufwand, Eisenhower-Toggles, Energie, Projekt, Fix). Wiederverwendet in (a) Add-Form (`DroppableColumn`, nur Felix) und (b) Edit-Modal.
- **Edit-Modal:** `components/dashboard/TaskEditModal.tsx` — Portal, Pattern `.hermes-modal-bg` + `.glass` + `.hermes-modal-close`. Öffnet bei Klick auf eine Karte (Klick ≠ Drag dank `distance:8`). Felder: Titel, Deadline (`DatePicker`), `TaskMetaFields`. Speichert via `PATCH /api/tasks/[id]`.
- **Karte:** `KanbanCard` zeigt für Felix kompakte Badges (Kontext, ⏱ Aufwand, Quadrant-Badge farbig, Energie, Projektname) + farbigen Quadrant-Streifen links; für andere unverändert.

## Style
Strikt bestehende Tokens/Klassen: `.pill`/`pill-rose|amber|blue|mute|ok`, `kanban-add-*`, `.glass`, `--brand/--ink-*/--line-*`, `DatePicker`. Neue CSS-Regeln nur additiv in `globals.css` mit `kanban-meta-*` / `task-edit-*` Präfix.

## Phasing
- **Phase 1 (jetzt):** Migration + lib + APIs + Add-Form-Controls + Karten-Badges + Edit-Modal (alles Felix-only).
- **Phase 2:** `GET /api/tasks/planning` — strukturierte Task+Meta-Liste für Kai.
- **Phase 3:** Kai timeboxed + Tages-Timeline-View.

## Verifikation
- Migration lokal/Prod angewandt; `GET /api/tasks/meta` 200.
- Felix: Task anlegen mit Metadaten → Badges erscheinen sofort (optimistic) + nach Reload.
- Klick auf Karte → Modal öffnet, Edit speichert, Badges aktualisieren.
- Andere Member: Board unverändert (keine neuen Controls/Badges).
- Build grün (Vercel-Check auf PR).
