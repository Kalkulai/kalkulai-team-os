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

## 1. Team-Member-IDs (Stand 2026-05-12, stabil über DB-Resets)

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
| GET | `/api/conflicts?linearId={IDENT}` | **Bearer** (seit 2026-05-12) | Branch+Issue+Assignee-Kreuzcheck | `{ branches, assignee, issue }` |
| GET | `/api/kpi/set-target?userId={uuid}` | **Bearer** (seit 2026-05-12) | Wochenziele tasks/calls/bugs | `{ tasks_target, calls_target, bugs_target }` |

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

```http
POST /api/tasks/create
Authorization: Bearer ${SECRET}
Content-Type: application/json

{
  "title": "Hermes-Setup finalisieren",
  "userId": "bd695d11-...",
  "source": "hermes"
}
```

- Wenn `source: 'hermes'` → Issue bekommt Linear-Label `Hermes` → Dashboard zeigt es mit `H`-Source-Icon und im Activity-Stream als `kind: 'hermes'`.
- Alternative zu `userId`: `assigneeId` (direkt Linear-User-ID).
- 400 wenn weder `assigneeId` noch `userId.linear_user_id` auflösbar (sonst würde Issue unassigned und im Dashboard verschwinden).
- Response: Linear-Issue-Objekt mit `id`, `identifier` (z.B. `KAL-42`), `url`.

```http
POST /api/tasks/complete
Authorization: Bearer ${SECRET}

{ "issueId": "<linear-issue-id>" }
```

Setzt Linear-State auf "Done" (via `LINEAR_DONE_STATE_ID`).

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

| Bereich | Lese-Quelle (Read) | Schreib-Pfad (Hermes) |
|---|---|---|
| Top-3-Tasks | Linear (`getIssuesForUser`) | `POST /api/tasks/create` mit `source:'hermes'` |
| Termine | Google Calendar (`getTodayEvents`) | **KEIN Schreibpfad** — read-only |
| KPIs (Counter) | Supabase `kpis` + `kpi_weeks` + `kpi_history` | `POST /api/kpis` (Anlage), `POST /api/kpis/{id}/adjust` (Increment) |
| Projekte + Steps | Supabase `kpis` (`type='project'/'step'`, via `parent_id`) | `POST /api/kpis` mit `type:'project'` → dann `type:'step', parent_id:<id>` |
| Step-Erledigung | s.o. | `PATCH /api/kpis/{stepId}` mit `{completed:true}` |
| Sales-Calls | Supabase `sales_logs` + HubSpot | `POST /api/sales/log-call` |
| Wochenziele | Supabase `kpi_targets` | `POST /api/kpi/set-target` |
| Aktivität | aggregiert in `lib/activity.ts` | **kein direkter Schreibpfad** — Events entstehen aus Quellen oben automatisch |

**Wichtig:** Activity-Stream hat **keinen direkten Write-Endpoint**. Wenn Hermes ein Event sichtbar machen will, schreibt es in die jeweilige Quelle (z.B. `adjust` für Counter → erscheint als `+N Anrufe`).

---

## 3.1 TypeScript-Client für Hermes

**Copy-Paste-Vorlage**: `examples/team-os-client.ts` (470+ Zeilen, keine Dependencies außer `fetch`).

Setup im Hermes-Repo:
```ts
import { TeamOSClient } from './team-os-client';

const client = new TeamOSClient({
  baseUrl: process.env.TEAM_OS_BASE_URL!,    // https://kalkulai-team-os.vercel.app
  secret:  process.env.TEAM_OS_API_SECRET!,  // DASHBOARD_API_SECRET (gleicher Wert wie team-os repo)
});

// Health-Check vor jedem Run
await client.healthCheck(leon.id); // → { ok: true, markdownLength: 612 }

// Counter mit Wochenziel
await client.createCounter({ userId: leon.id, name: 'Cold Calls', unit: 'Anrufe', weeklyTarget: 30 });

// Projekt mit Steps atomar
await client.createProjectWithSteps({
  userId: leon.id,
  name: 'Hermes-Integration',
  dueDate: '2026-06-15',
  steps: [
    { name: 'Schema validieren' },
    { name: 'Client einbauen', dueDate: '2026-05-25' },
  ],
});

// Linear-Task aus Hermes-Insight
await client.createHermesTask({ title: 'Söhnchen-Pricing einbauen', userId: leon.id });
```

Verfügbare Methoden (alle typed, alle authentifiziert wenn nicht anders markiert):
- `listMembers()` *(unauth)*, `memberByName(name)`, `listKpis(userId)`, `healthCheck(userId)`
- `createCounter`, `createProject`, `addStep`, `createProjectWithSteps`
- `incrementCounter(kpiId, delta)`, `completeStep(stepId)`, `reopenStep(stepId)`
- `updateKpi(kpiId, patch)`, `deleteKpi(kpiId)`
- `createHermesTask`, `createTask`, `completeTask(linearIssueId)`
- `logSalesCall`, `setWeeklyTargets`

Fehler werden als `TeamOSError` (mit `.status`-Property) geworfen.

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

---

## 7. Datenmodell-Verträge (Source of Truth)

- TypeScript-Types: `types/index.ts`
- DB-Schema: `supabase/migrations/00*.sql` (Migrations 001-007)
- Activity-Event-Shape: `components/dashboard/ActivityTimeline.tsx` — `ActivityKind`, `ActivityEvent`

Bei Schema-Änderungen: neue Migration + Type-Update + diese Doku updaten.

---

## 8. Verifikations-Checkliste für Agenten

Vor jedem Schreib-Call:
- [ ] `DASHBOARD_API_SECRET` als Env-Var verfügbar.
- [ ] Member-UUID aus `/api/members` geholt (nicht hardgecodet).
- [ ] Bei Step-Anlage: `parent_id` ist eine valide Project-ID (gleicher `user_id`).
- [ ] Bei Counter-Adjust: KPI ist `type='counter'`.
- [ ] Bei Task-Create: Member hat `linear_user_id` (sonst 400).

Smoke-Test nach Setup-Änderungen:
```bash
curl -H "Authorization: Bearer $DASHBOARD_API_SECRET" \
  "http://localhost:3000/api/briefing/build?userId=$LEON" | jq .markdown
```
→ Liefert komplettes Briefing inkl. Linear/Calendar/GitHub/Notion. Wenn der HTTP-Code 200 ist und das Markdown nicht leer → Pipeline gesund.

---

## 9. Bekannte Lücken (Stand 2026-05-12, nach Pre-Hermes-Härtung)

**Gefixt am 2026-05-12 (Pre-Hermes-Sprint):**
- ✅ `/api/conflicts` jetzt mit Bearer-Auth.
- ✅ `/api/kpi/set-target` GET jetzt mit Bearer-Auth.
- ✅ `/api/members` Response sanitized — `google_refresh_token` wird nicht mehr public ausgegeben.
- ✅ **Browser-Auth-Layer** — `middleware.ts` verlangt für alle HTML-Seiten ein signiertes Auth-Cookie. Login-Page `/login` + Logout-Endpoint. Onboarding-Doku in `docs/TEAM-ACCESS.md`.
- ✅ `lib/kpis.ts` hat direkten Test-Coverage (17 neue Tests in `tests/kpis.test.ts`).
- ✅ `examples/team-os-client.ts` als typed Hermes-Client.

**Hermes-Pfad bleibt unbetroffen**: Server-to-Server-Calls senden `Authorization: Bearer ${DASHBOARD_API_SECRET}` und gehen direkt durch — **keine Code-Änderung im Hermes-Repo nötig**. Die Browser-Auth wirkt nur auf HTML-Seiten und auf API-Calls ohne Bearer-Header.

**Noch offen:**
- **Public Secret**: `NEXT_PUBLIC_DASHBOARD_API_SECRET` liegt im Client-Bundle (für die Browser-Komponenten KpiManager, ProjectsTracker, KpiTracker, SalesFab, TaskList). Vor harter Production-Schutz: Cookie/Session-Auth statt Public-Env-Var. Hermes-seitig **kein Blocker** — Hermes liest `DASHBOARD_API_SECRET` server-seitig.
- **Calendar pro Person**: nur Leon hat `google_refresh_token`, Felix+Paul müssen `/api/oauth/google/start?userId=<id>` durchlaufen.
- **HubSpot pro Person**: Paul (sales) hat `hubspot_owner_id=null` — Call-Counter aus CRM fehlt entsprechend.
- **Activity-Write-Endpoint fehlt**: Aktuell kann Hermes Events nur indirekt erzeugen (via KPI-Adjust, Linear-Create, sales-log). Direkter `POST /api/activity/event` wäre erweiterbar — aber nicht nötig für Hermes-MVP (Indirektion deckt alle aktuellen Use-Cases ab).

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

# Briefing prüfen
curl -H "$H" "$BASE/api/briefing/build?userId=$UID" | jq .markdown
```
