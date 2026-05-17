# AI-Operations — Hermes & Claude-Code Manual

**Zweck:** Vollständige Referenz für AI-Agenten (Hermes, Claude Code, künftige Worker), die Dashboard-Inhalte schreiben/aktualisieren. Dieses Dokument ersetzt Memory/Training: Wenn du als Agent hierher kommst, weißt du danach genau, welche Endpoints existieren, welche Daten reingehören, und wie Auth funktioniert.

**Architektur-Prinzip (siehe auch `project_arch_principles.md` in Memory):** Das Dashboard wird **primär von AI gepflegt** — manuelle UI-Edits sind Fallback. Jede schreibbare Entity hat einen `/api`-Endpoint mit klarer Bearer-Auth.

---

## 0. Auth & Base-URL

| Umgebung | Base-URL | Auth-Header |
|---|---|---|
| Lokal | `http://localhost:3000` | `Authorization: Bearer ${DASHBOARD_API_SECRET}` |
| Production | `https://kalkulai-team-os.vercel.app` | `Authorization: Bearer ${DASHBOARD_API_SECRET}` |

**Secret-Source:**
- Server-side (CLI, Cron, Hermes): `process.env.DASHBOARD_API_SECRET` (gleich für lokal + Prod via `vercel env pull`).
- Client-side (Browser-Komponenten in diesem Repo): `process.env.NEXT_PUBLIC_DASHBOARD_API_SECRET` — derselbe Wert, im Bundle. **NICHT von externen Agenten verwenden** — das ist eine bekannte Schwachstelle (s. Findings 2026-05-12).

**Standard-Header für jeden Write-Call:**
```http
Authorization: Bearer <DASHBOARD_API_SECRET>
Content-Type: application/json
```

---

## 1. Team-Member-IDs (Stand 2026-05-17, stabil über DB-Resets)

| Name | Rolle | User-ID (Supabase) | Linear-ID | GitHub |
|---|---|---|---|---|
| Leon | dev | `bd695d11-0632-4a0a-b1d0-db43acf46a68` | `c625c506-1fd2-4d51-98c1-12b51a1554a4` | `lp-kai` |
| Felix | dev | `c9677ade-e42c-4593-81c6-7a2108b145fd` | `da01a9e9-7b1e-4899-8da8-a04fbfd47b6a` | `fmag0009` |
| Paul | sales | `24d43f6d-4a7e-458b-a119-84ecb8e6616f` | `f0fbbcb8-f50d-495f-b677-02fd52c1c1e6` | `paul-kai` |

Live-Lookup: `GET /api/members` (kein Auth nötig).

---

## 2. Endpoint-Inventar

### 2.1 Read-Only

| Methode | Pfad | Auth | Zweck | Response |
|---|---|---|---|---|
| GET | `/api/members` | **kein** | Alle TeamMember (ohne `google_refresh_token`) | `Omit<TeamMember, 'google_refresh_token'>[]` |
| GET | `/api/conflicts?linearId={IDENT}` | **Bearer** | Branch+Issue+Assignee-Kreuzcheck | `{ branches, assignee, issue }` |
| GET | `/api/kpi/set-target?userId={uuid}` | **Bearer** | Wochenziele tasks/calls/bugs | `{ tasks_target, calls_target, bugs_target }` |

`/api/members` bleibt bewusst public — Hermes braucht die Member-Liste ohne Secret, und es enthält keine sensiblen Tokens (nur Handles/Mails/Calendar-Email).

### 2.2 KPIs & Projekte (Hermes-Hauptpfad)

#### Liste lesen

```http
GET /api/kpis?userId={uuid}
Authorization: Bearer ${SECRET}
```

Response: `KpiWithWeek[]` — flache Liste, Projekte/Steps via `type` + `parent_id` verbunden.

**Type-Shape:**
```ts
interface KpiWithWeek {
  id: string;
  user_id: string;
  parent_id: string | null;     // bei type='step': verweist auf project.id
  name: string;
  unit: string;                 // counter: 'Anrufe', 'Demos'; project/step: ''
  position: number;
  type: 'counter' | 'project' | 'step';
  due_date: string | null;      // 'YYYY-MM-DD'
  completed: boolean;
  completed_at: string | null;  // ISO 8601, wird via PATCH automatisch gesetzt
  created_at: string;           // ISO 8601
  target: number;               // counter: Wochenziel; project/step: 0
  actual: number;               // counter: aktueller Wert; project/step: 0
  history?: number[];           // counter: 7-Tage-Sparkline (oldest→newest, forward-filled)
}
```

#### Counter / Projekt / Step erstellen

Ein Endpoint, drei Modi via `type`:

```http
POST /api/kpis
Authorization: Bearer ${SECRET}
Content-Type: application/json
```

**Counter** (KPI mit Wochenziel + Unit):
```json
{
  "user_id": "bd695d11-0632-4a0a-b1d0-db43acf46a68",
  "type": "counter",
  "name": "Sales Calls",
  "unit": "Anrufe",
  "target": 30
}
```

**Auto-tracked Counter** (Wert wird live aus externer Quelle gelesen, kein manuelles `adjust` mehr nötig):
```json
{
  "user_id": "24d43f6d-4a7e-458b-a119-84ecb8e6616f",
  "type": "counter",
  "name": "Cold Calls",
  "unit": "Anrufe",
  "target": 30,
  "source": "hubspot:calls-week"
}
```

Erlaubte `source`-Werte:
- `"manual"` (Default) — Wert lebt in `kpi_weeks.actual`, wird via `POST /api/kpis/{id}/adjust` hochgezählt.
- `"hubspot:calls-week"` — Voraussetzung: Member hat `hubspot_owner_id` gesetzt UND `role='sales'`. `actual` = Anzahl HubSpot-Calls dieser Woche (Montag-basis). `POST /api/kpis/{id}/adjust` returnt 409 für solche KPIs.

**Projekt** (Container, mit optionaler Deadline):
```json
{
  "user_id": "bd695d11-0632-4a0a-b1d0-db43acf46a68",
  "type": "project",
  "name": "Hermes integrieren",
  "due_date": "2026-06-30"
}
```

**Step** (Teilschritt, muss zu Projekt gehören):
```json
{
  "user_id": "bd695d11-0632-4a0a-b1d0-db43acf46a68",
  "type": "step",
  "parent_id": "<project-id-aus-vorigem-call>",
  "name": "Hermes-Schema entwerfen",
  "due_date": "2026-05-20"
}
```

Response: `KpiWithWeek` (mit neuer `id`).

#### Counter hochzählen (idempotent über Tagessumme)

```http
POST /api/kpis/{kpiId}/adjust
Authorization: Bearer ${SECRET}
Content-Type: application/json

{ "delta": 1 }
```

- `delta` muss number, non-zero sein.
- Schreibt `kpi_weeks` (Wochenwert) **und** `kpi_history` (Tages-Snapshot per `(kpi_id, day)`-Upsert) → Activity-Stream zeigt automatisch `+N {unit}` Event.
- Negative Deltas möglich, Mindest-Untergrenze ist 0 (clamp).

Response: `{ target, actual }`.

#### Step als erledigt markieren / Definition ändern / löschen

```http
PATCH /api/kpis/{id}
Authorization: Bearer ${SECRET}
Content-Type: application/json
```

Body-Felder (alle optional, nur was gesetzt ist wird geändert):
```json
{
  "name": "Neuer Name",
  "unit": "Calls",
  "parent_id": "<uuid|null>",
  "due_date": "2026-07-01",
  "completed": true,
  "target": 50
}
```

- `completed: true` setzt automatisch `completed_at = now()` → Activity-Stream zeigt "Teilschritt erledigt"-Event.
- `target` wird für Counter in `kpi_weeks` (aktuelle Woche) upserted.

```http
DELETE /api/kpis/{id}
Authorization: Bearer ${SECRET}
```

Löscht KPI + Steps (cascade). Idempotent (200 auch wenn nicht vorhanden).

### 2.3 Tasks (Linear-Brücke)

#### Task erstellen

```http
POST /api/tasks/create
Authorization: Bearer ${SECRET}
Content-Type: application/json
```

**Single-Assignee (Hermes-Standard):**
```json
{
  "title": "Hermes-Setup finalisieren",
  "userId": "bd695d11-...",
  "source": "hermes"
}
```

**Multi-Assignee (Team-Task)** — legt pro Person ein separates Linear-Issue an, alle mit Label `Team-Task` und einem gemeinsamen Description-Footer:
```json
{
  "title": "Sprint-Planning vorbereiten",
  "assigneeUserIds": ["bd695d11-...", "c9677ade-..."],
  "priority": 2
}
```

**Team-wide** — alle Members mit `linear_user_id`:
```json
{
  "title": "Security-Awareness-Update lesen",
  "teamWide": true
}
```

Body-Felder:
| Feld | Typ | Zweck |
|---|---|---|
| `title` | `string` | **Pflicht** — Issue-Titel |
| `userId` | `string` | Supabase-User-ID → wird zu `linear_user_id` aufgelöst |
| `assigneeId` | `string` | Linear-User-ID direkt (überschreibt `userId`) |
| `assigneeUserIds` | `string[]` | Multi-Assignee — Supabase-User-IDs |
| `teamWide` | `boolean` | Alle aktiven Members |
| `source` | `'hermes' \| 'notion' \| 'linear'` | Setzt Label + Activity-Icon |
| `priority` | `number` | 1=urgent, 2=high, 3=medium, 4=low |
| `dueDate` | `string \| null` | ISO-Datum `'YYYY-MM-DD'` |

Response Single: Linear-Issue-Objekt mit `id`, `identifier` (z.B. `KAL-42`), `url`.
Response Multi: `{ tasks: LinearIssue[]; teamTaskGroupId: string }`.

Fehler 400 wenn weder `assigneeId` noch `userId.linear_user_id` auflösbar.

**Team-Task-Mechanismus:** Jedes Duplikat-Issue bekommt diesen unsichtbaren Footer in der Description:
```
<!-- team-task-group:<uuid> -->
<!-- team-task-assignees:<userId1>,<userId2>,... -->
```
Das Dashboard erkennt ihn beim Laden (`lib/team-tasks.ts: parseTeamTaskGroupId / parseTeamTaskAssignees`) und rendert einen Avatar-Stack (Initialen-Kreise) auf der Task-Karte. Jeder Assignee sieht seinen eigenen Issue — Completion ist pro Person separat.

#### Task abschließen

```http
POST /api/tasks/complete
Authorization: Bearer ${SECRET}

{ "issueId": "<linear-issue-id>" }
```

Setzt Linear-State auf "Done" (via `LINEAR_DONE_STATE_ID`).

#### Task-Status ändern (Kanban-DnD)

```http
PATCH /api/tasks/status
Authorization: Bearer ${SECRET}
Content-Type: application/json

{ "issueId": "<linear-issue-id>", "status": "in-progress" }
```

Erlaubte `status`-Werte: `"todo"` | `"in-progress"` | `"on-hold"` | `"done"`.

Mapping auf Linear-States (via Env-Vars):
| Status | Linear-State-ID (Env) |
|---|---|
| `todo` | `LINEAR_TODO_STATE_ID` |
| `in-progress` | `LINEAR_IN_PROGRESS_STATE_ID` |
| `on-hold` | `LINEAR_IN_PROGRESS_STATE_ID` (kein separater State) |
| `done` | `LINEAR_DONE_STATE_ID` |

Dieser Endpoint wird vom Kanban-Board (`components/dashboard/KanbanBoard.tsx`) aufgerufen wenn ein Task per Drag & Drop in eine andere Spalte gezogen wird.

### 2.4 Sales-Logs (für sales-Rolle)

```http
POST /api/sales/log-call
Authorization: Bearer ${SECRET}

{
  "userId": "24d43f6d-...",
  "type": "cold-call",
  "note": "Optional"
}
```

- `type`: `'cold-call' | 'demo' | 'follow-up'`.
- Schreibt in `sales_logs`. Wird in `weekActuals.calls_made` aggregiert + (nur für `type=demo`) als Activity-Event gerendert.

### 2.5 Briefing (Render-Pipeline für Telegram)

```http
GET /api/briefing/build?userId={uuid}
Authorization: Bearer ${SECRET}
```

Liefert Markdown-Snapshot (Telegram-formatiert) inkl. aller Branches, Top-3-Tasks, Termine, Wochenstand, Insights. Read-only.

```http
POST /api/briefing/send
Authorization: Bearer ${SECRET}

{ "userId": "<uuid>" }
```

Triggert `buildDailyBriefing` + Telegram-Send. Body ohne `userId` = alle Member. Wird vom Cron (06:00 Berlin) automatisch aufgerufen.

### 2.6 Webhooks (extern → uns)

| Pfad | Trigger | Auth |
|---|---|---|
| `POST /api/webhooks/github/pr-merged` | GitHub PR merged | HMAC-Sig via `GITHUB_WEBHOOK_SECRET` |
| `GET /api/oauth/google/start?userId={uuid}` | Google-Calendar-Auth-Flow | Browser-Flow (kein Bearer) |
| `GET /api/oauth/google/callback?code=…` | OAuth-Callback | Google → schreibt `google_refresh_token` |

---

## 3. Datenfluss-Übersicht (wo speichern, was lesen)

| Bereich | Lese-Quelle (Read) | Schreib-Pfad (Hermes/DnD) |
|---|---|---|
| Top-3-Tasks | Linear (`getIssuesForUser`) | `POST /api/tasks/create` mit `source:'hermes'` |
| Task-Status | Linear (`state.type`) | `PATCH /api/tasks/status` (Kanban-DnD) |
| Termine | Google Calendar (`getTodayEvents`) | **KEIN Schreibpfad** — read-only |
| KPIs (Counter) | Supabase `kpis` + `kpi_weeks` + `kpi_history` | `POST /api/kpis` (Anlage), `POST /api/kpis/{id}/adjust` (Increment) |
| Projekte + Steps | Supabase `kpis` (`type='project'/'step'`, via `parent_id`) | `POST /api/kpis` mit `type:'project'` → dann `type:'step', parent_id:<id>` |
| Step-Erledigung | s.o. | `PATCH /api/kpis/{stepId}` mit `{completed:true}` — auch via Kanban-DnD |
| Sales-Calls | Supabase `sales_logs` + HubSpot | `POST /api/sales/log-call` |
| Wochenziele | Supabase `kpi_targets` | `POST /api/kpi/set-target` |
| Aktivität | aggregiert in `lib/activity.ts` | **kein direkter Schreibpfad** — Events entstehen aus Quellen oben automatisch |

**Wichtig:** Activity-Stream hat **keinen direkten Write-Endpoint**. Wenn Hermes ein Event sichtbar machen will, schreibt es in die jeweilige Quelle (z.B. `adjust` für Counter → erscheint als `+N Anrufe`).

---

## 3.1 System-Überblick: wie die Teile zusammenhängen

```
┌─────────────────────────────────────────────────────────────┐
│  Datenquellen (Read)                                        │
│  Linear ──────────── getIssuesForUser()                     │
│  Google Calendar ─── getTodayEvents()                       │
│  GitHub ──────────── getRecentCommits(), getOpenPRs()       │
│  HubSpot ─────────── getCallsThisWeek()  (sales-only)       │
│  Supabase ─────────── kpis, kpi_weeks, kpi_history,         │
│                        team_members, sales_logs              │
└───────────────────────────────┬─────────────────────────────┘
                                │
                      lib/unified-tasks.ts
                      mergeTasks() — kombiniert Linear-Issues
                      und Projekt-Steps zu UnifiedTask[],
                      sortiert nach Fälligkeit dann Priorität
                                │
           ┌────────────────────┼────────────────────┐
           ▼                    ▼                    ▼
  /dashboard (TaskList)  /dashboard/board      Activity-Stream
  ┌──────────────┐       ┌──────────────┐      lib/activity.ts
  │ To Do        │       │ Kanban-Board │      events aus allen
  │ In Progress  │  DnD  │ 4 Spalten    │      Quellen
  │ On Hold      │ ────► │ todo/progress│
  │ Done         │       │ on-hold/done │
  └──────────────┘       └──────┬───────┘
                                │ PATCH /api/tasks/status
                                │ PATCH /api/kpis/{id}
                                ▼
                    Linear API (State-Change)
                    Supabase (Step-Completion)

┌─────────────────────────────────────────────────────────────┐
│  Write-Pfade (Hermes / Claude Code)                         │
│  POST /api/tasks/create  — Linear-Issue(s) anlegen          │
│  POST /api/kpis          — Counter/Projekt/Step             │
│  POST /api/kpis/{id}/adjust — Counter hochzählen            │
│  PATCH /api/kpis/{id}    — Step erledigen / umbenennen      │
│  POST /api/tasks/complete — Linear-Issue auf Done           │
│  POST /api/sales/log-call — Sales-Event loggen              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Team-Task-Mechanismus (seit 2026-05-17)                    │
│  assigneeUserIds:[A,B] → N separate Linear-Issues           │
│  alle mit Label "Team-Task"                                 │
│  alle mit Description-Footer:                               │
│    <!-- team-task-group:<uuid> -->                          │
│    <!-- team-task-assignees:<idA>,<idB> -->                 │
│  → Dashboard: Avatar-Stack (Initialen-Kreise) auf Karte     │
│  → Completion: pro Person separat                           │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Hermes-Standard-Workflows

### 4.1 Neues Wochenziel für Leon anlegen

```bash
# Annahme: $SECRET = DASHBOARD_API_SECRET, $LEON = "bd695d11-..."

# 1. Counter "Cold Calls" mit Wochenziel 30
curl -X POST "$BASE/api/kpis" -H "Authorization: Bearer $SECRET" -H "Content-Type: application/json" \
  -d '{"user_id":"'$LEON'","type":"counter","name":"Cold Calls","unit":"Anrufe","target":30}'

# 2. Mehrere Tage später: +5 Anrufe heute
curl -X POST "$BASE/api/kpis/$KPI_ID/adjust" -H "Authorization: Bearer $SECRET" -H "Content-Type: application/json" \
  -d '{"delta":5}'
```

### 4.2 Projekt mit 3 Steps für Felix anlegen

```bash
PROJ=$(curl -s -X POST "$BASE/api/kpis" -H "Authorization: Bearer $SECRET" -H "Content-Type: application/json" \
  -d '{"user_id":"'$FELIX'","type":"project","name":"Email-OOM-Fix","due_date":"2026-05-25"}' | jq -r .id)

for STEP in "Heap-Dump analysieren" "Fetch-Cap einbauen" "Load-Test 10k Mails"; do
  curl -X POST "$BASE/api/kpis" -H "Authorization: Bearer $SECRET" -H "Content-Type: application/json" \
    -d '{"user_id":"'$FELIX'","type":"step","parent_id":"'$PROJ'","name":"'$STEP'"}'
done
```

### 4.3 Linear-Task aus Hermes-Insight erstellen

```bash
curl -X POST "$BASE/api/tasks/create" -H "Authorization: Bearer $SECRET" -H "Content-Type: application/json" \
  -d '{"title":"Söhnchen Pricing-Feedback einbauen","userId":"'$PAUL'","source":"hermes"}'
```

Resultat: Linear-Issue mit Label `Hermes` → Dashboard zeigt Task mit `H`-Icon + Activity-Event `kind: 'hermes'`.

### 4.4 Team-Task für Leon + Felix anlegen

```bash
curl -X POST "$BASE/api/tasks/create" -H "Authorization: Bearer $SECRET" -H "Content-Type: application/json" \
  -d '{
    "title": "Sprint-Retro vorbereiten",
    "assigneeUserIds": ["bd695d11-0632-4a0a-b1d0-db43acf46a68", "c9677ade-e42c-4593-81c6-7a2108b145fd"]
  }'
```

Resultat: 2 Linear-Issues (je einer für Leon + Felix), beide mit Label `Team-Task`. Das Dashboard zeigt auf beiden Task-Karten den Avatar-Stack `[L][F]`.

---

## 5. Sources im Activity-Stream (welche Events landen wo)

Source-Label und `kind` sind die Sichtbarkeits-Marker. Übersicht:

| Quelle (Code) | Source-Label | Kind | Trigger |
|---|---|---|---|
| Calendar (past meeting) | `Calendar` / `Calendar · Sales` | `standup` / `call` | Termin endet |
| Calendar (running) | gleich | gleich | Aktuell laufendes Meeting |
| GitHub commit | `GitHub` | `commit` | Commit auf eigenem Branch |
| GitHub PR opened | `{repoShort}` | `pr-open` | `getRecentlyOpenedPRs` |
| GitHub PR merged | `{repoShort}` bzw. `… · Dependabot` | `merge` / `dep` | PR merged in den letzten 2d |
| Linear-Issue completed | `Linear` | `ok` | `state.type='completed'` |
| Linear-Issue created | `Hermes` (wenn Label) bzw. `Linear` | `hermes` / `create` | Neues Issue letzte 2d |
| HubSpot-Call | `HubSpot` | `call` | Sales-User mit `hubspot_owner_id` |
| sales_logs (demo) | `Manual` | `call` | Manual-Log-Button im FAB |
| KPI-Counter +N | `KPIs` | `counter` | `adjust` schreibt `kpi_history` |
| Projekt-Step erledigt | `Projects` | `step-done` | `PATCH /api/kpis/{stepId}` `completed:true` |

---

## 6. Häufige Fehlerquellen für Agenten

1. **403/401**: Bearer-Token fehlt oder falsch. `DASHBOARD_API_SECRET` aus `.env.local` (lokal) bzw. `vercel env pull` (prod).
2. **400 "userId required"**: Query-Param vergessen — bei GET `/api/kpis?userId=...`, bei POST im Body als `user_id`.
3. **Task wird im Dashboard nicht angezeigt**: Member hat kein `linear_user_id` ODER Task hat keine `assigneeId` — Server returnt 400 mit explizitem Hinweis.
4. **Counter bleibt 0 trotz `adjust`**: KPI gehört einem anderen User oder ist `type='project'/'step'` (Adjust funktioniert nur für Counter).
5. **Sparkline flat**: `kpi_history` braucht mindestens 2 verschiedene Tage mit Adjust-Calls. Bis dahin zeigt UI Fallback-Kurve.
6. **Calendar leer**: Member hat kein `google_refresh_token` ODER OAuth-Flow nie durchlaufen. Aktuell: nur Leon hat das gesetzt.
7. **Team-Task ohne Avatar-Stack**: Description-Footer fehlt oder wurde manuell in Linear editiert. Neu anlegen via API.
8. **PATCH /api/tasks/status 400**: Unbekannter `status`-Wert ODER fehlende Env-Vars `LINEAR_TODO_STATE_ID` / `LINEAR_IN_PROGRESS_STATE_ID`.

---

## 7. Datenmodell-Verträge (Source of Truth)

- TypeScript-Types: `types/index.ts`
- DB-Schema: `supabase/migrations/00*.sql` (Migrations 001-007)
- Activity-Event-Shape: `components/dashboard/ActivityTimeline.tsx` — `ActivityKind`, `ActivityEvent`
- UnifiedTask (Dashboard-intern): `lib/unified-tasks.ts` — `UnifiedTask`, `mergeTasks`
- Team-Task-Footer-Parser: `lib/team-tasks.ts` — `parseTeamTaskGroupId`, `parseTeamTaskAssignees`, `buildTeamTaskDescription`

Bei Schema-Änderungen: neue Migration + Type-Update + diese Doku updaten.

---

## 8. Verifikations-Checkliste für Agenten

Vor jedem Schreib-Call:
- [ ] `DASHBOARD_API_SECRET` als Env-Var verfügbar.
- [ ] Member-UUID aus `/api/members` geholt (nicht hardgecodet).
- [ ] Bei Step-Anlage: `parent_id` ist eine valide Project-ID (gleicher `user_id`).
- [ ] Bei Counter-Adjust: KPI ist `type='counter'`.
- [ ] Bei Task-Create: Member hat `linear_user_id` (sonst 400).
- [ ] Bei Team-Task: `assigneeUserIds` sind Supabase-User-IDs, nicht Linear-IDs.

Smoke-Test nach Setup-Änderungen:
```bash
curl -H "Authorization: Bearer $DASHBOARD_API_SECRET" \
  "http://localhost:3000/api/briefing/build?userId=$LEON" | jq .markdown
```
→ Liefert komplettes Briefing inkl. Linear/Calendar/GitHub/Notion. Wenn der HTTP-Code 200 ist und das Markdown nicht leer → Pipeline gesund.

---

## 9. Changelog

| Datum | Sprint | Änderungen |
|---|---|---|
| 2026-05-12 | Pre-Hermes | `/api/conflicts` + `/api/kpi/set-target` mit Bearer-Auth; `/api/members` sanitized; Browser-Auth-Layer (Middleware + Cookie); kpis.ts Test-Coverage (17 Tests) |
| 2026-05-13–15 | Dashboard-Sprint | Auto-tracked KPI-Counter (`source:'hubspot:calls-week'`); Calendar-OAuth-Fix (Web vs Desktop Client); Task-Edit + 5s-Undo; Activity-Call-Clustering (HubSpot-Calls zu Sessions); Profil-Cookie-Persistenz |
| 2026-05-16–17 | Feature-Sprint | **Team Tasks** (`assigneeUserIds`, `teamWide`, Description-Footer, Label `Team-Task`, Avatar-Stack auf Karte); **Kanban-DnD** (Drag & Drop zwischen Spalten; `PATCH /api/tasks/status`; Step-Completion via DnD); **Kanban-Spaltenfarben** (In-Progress blau, On-Hold gelb, Done grün, todo grau); **TaskList-Layout** (row1-meta/row2-meta, Avatar-Slot); **Kanban-Sort** exakt nach ISO-Datum; **Mobile-Stack** unter lg |

**Bekannte Lücken (Stand 2026-05-17):**
- **Public Secret**: `NEXT_PUBLIC_DASHBOARD_API_SECRET` liegt im Client-Bundle. Kein Blocker für Hermes (server-seitig).
- **Calendar pro Person**: nur Leon hat `google_refresh_token`. Felix+Paul: `/api/oauth/google/start?userId=<id>`.
- **HubSpot pro Person**: Paul hat `hubspot_owner_id=null` — CRM-Call-Counter fehlt.
- **Activity-Write-Endpoint fehlt**: Hermes erzeugt Events indirekt (KPI-Adjust, Linear-Create, sales-log). Direkter `POST /api/activity/event` wäre erweiterbar — nicht nötig für MVP.
- **`examples/team-os-client.ts` entfernt**: Datei existiert nicht mehr. Calls direkt via `fetch` (s. Schnellreferenz).

---

## 10. Schnellreferenz

```
BASE=http://localhost:3000
SECRET=$DASHBOARD_API_SECRET
H="Authorization: Bearer $SECRET"
J="Content-Type: application/json"

# Members
curl $BASE/api/members

# KPIs lesen
curl -H "$H" "$BASE/api/kpis?userId=$UID"

# Counter +1
curl -X POST -H "$H" -H "$J" -d '{"delta":1}' "$BASE/api/kpis/$KPI/adjust"

# Step done
curl -X PATCH -H "$H" -H "$J" -d '{"completed":true}' "$BASE/api/kpis/$STEP"

# Linear-Task via Hermes
curl -X POST -H "$H" -H "$J" \
  -d '{"title":"X","userId":"'$UID'","source":"hermes"}' \
  "$BASE/api/tasks/create"

# Team-Task (mehrere Assignees)
curl -X POST -H "$H" -H "$J" \
  -d '{"title":"X","assigneeUserIds":["'$LEON'","'$FELIX'"]}' \
  "$BASE/api/tasks/create"

# Task-Status ändern (Kanban-DnD-Pfad)
curl -X PATCH -H "$H" -H "$J" \
  -d '{"issueId":"<linear-id>","status":"in-progress"}' \
  "$BASE/api/tasks/status"

# Briefing prüfen
curl -H "$H" "$BASE/api/briefing/build?userId=$UID" | jq .markdown
```
