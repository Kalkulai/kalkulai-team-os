# TEAM_OS_AGENT_API — Hermes & Kai Reference

**Scope:** Alle Endpunkte, die ein headless Backend-Agent (Hermes, Kai, Claude Code) ohne Browser aufrufen kann.
**Auth:** `Authorization: Bearer $DASHBOARD_API_SECRET` (alle Endpunkte außer `/api/members`).
**Base-URL:** `https://kalkulai-team-os.vercel.app`

---

## Auth & Member-IDs

```bash
BASE=https://kalkulai-team-os.vercel.app
H="Authorization: Bearer $DASHBOARD_API_SECRET"

FELIX=c9677ade-e42c-4593-81c6-7a2108b145fd
LEON=bd695d11-0632-4a0a-b1d0-db43acf46a68
PAUL=24d43f6d-4a7e-458b-a119-84ecb8e6616f

# Live-Lookup (kein Auth nötig)
curl $BASE/api/members
```

---

## Plan-Layer (neu)

### GET /api/plan/tasks

Liest Plan-Tasks (Linear-Issues mit gesetzter `phase`) für einen User.
Optionale Filter: `phase`, `bereich`, `status`.

```bash
curl -H "$H" "$BASE/api/plan/tasks?userId=$FELIX"
curl -H "$H" "$BASE/api/plan/tasks?userId=$FELIX&phase=1&bereich=angebot"
curl -H "$H" "$BASE/api/plan/tasks?userId=$FELIX&status=in_progress"
```

**Response:**
```json
{
  "tasks": [{
    "id": "<linear-issue-id>",
    "kind": "linear",
    "identifier": "KAL-42",
    "title": "Angebots-Wizard MVP",
    "status": "in_progress",
    "priority": 2,
    "dueDate": "2026-07-15",
    "phase": 1,
    "bereich": "angebot",
    "owner": "<userId>",
    "source_kpi_id": null
  }],
  "count": 1
}
```

**Status-Werte:** `todo`, `in_progress`, `on_hold`, `done`
**Bereich-Werte:** `dashboard` | `angebot` | `planung` | `kommunikation` | `ma_mobil` | `allgemein`

---

### POST /api/plan/tasks

Erstellt einen Plan-Task (Linear-Issue + task_meta).

```bash
curl -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{
    "userId": "'$FELIX'",
    "title": "Preisblatt-Template bauen",
    "phase": 1,
    "bereich": "angebot",
    "status": "todo",
    "priority": 2,
    "dueDate": "2026-07-20"
  }' "$BASE/api/plan/tasks"
```

**Pflichtfelder:** `userId`, `title`, `phase` (1–9), `bereich`
**Optionale Felder:** `status`, `priority` (1=urgent, 4=low), `dueDate` (YYYY-MM-DD)

---

### PATCH /api/plan/tasks/:id

Aktualisiert einen Plan-Task. Nur gesendete Felder werden überschrieben.

```bash
curl -X PATCH -H "$H" -H "Content-Type: application/json" \
  -d '{
    "phase": 2,
    "status": "in_progress",
    "userId": "'$FELIX'"
  }' "$BASE/api/plan/tasks/<linear-issue-id>"
```

---

### DELETE /api/plan/tasks/:id

Entfernt phase/bereich aus task_meta (demotiert den Task aus dem Plan).
`?archive=true` archiviert zusätzlich das Linear-Issue.

```bash
curl -X DELETE -H "$H" "$BASE/api/plan/tasks/<linear-issue-id>"
curl -X DELETE -H "$H" "$BASE/api/plan/tasks/<linear-issue-id>?archive=true"
```

---

### POST /api/plan/sync-from-kpis

**Felix-Use-Case:** Spiegelt KPI-Steps (Projekt-Teilschritte) als Plan-Tasks.
Duplikate werden anhand des Titels erkannt und übersprungen.

```bash
# Alle Steps für Felix in Phase 1 / Bereich Angebot spiegeln
curl -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{
    "userId": "'$FELIX'",
    "phase": 1,
    "bereich": "angebot"
  }' "$BASE/api/plan/sync-from-kpis"

# Nur Steps eines bestimmten Projekts (Substring-Filter)
curl -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{
    "userId": "'$FELIX'",
    "phase": 1,
    "bereich": "angebot",
    "projectFilter": "Quote"
  }' "$BASE/api/plan/sync-from-kpis"

# Dry-Run: zeigt was erstellt würde ohne zu schreiben
curl -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{"userId":"'$FELIX'","phase":1,"bereich":"angebot","dryRun":true}' \
  "$BASE/api/plan/sync-from-kpis"
```

**Response:**
```json
{ "created": 3, "skipped": 1, "tasks": [
    { "id": "...", "identifier": "KAL-55", "title": "MVP Preisblatt", "source_kpi_id": "<kpi-step-id>" }
] }
```

**Status-Mapping KPI → Plan:**
| KPI-Status | Plan-Status |
|---|---|
| `backlog` | `backlog` (Linear Todo) |
| `todo` | `todo` |
| `in-progress` | `in_progress` |
| `on-hold` | `on_hold` |

---

## Bestehende Endpunkte (agent-tauglich)

### KPIs

```bash
# Alle KPIs lesen
curl -H "$H" "$BASE/api/kpis?userId=$FELIX"

# Counter erstellen
curl -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{"user_id":"'$FELIX'","type":"counter","name":"Angebote","unit":"Stk","target":5}' \
  "$BASE/api/kpis"

# Projekt + Steps erstellen
PROJ=$(curl -s -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{"user_id":"'$FELIX'","type":"project","name":"Q3 Pilot","due_date":"2026-09-30"}' \
  "$BASE/api/kpis" | jq -r .id)

curl -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{"user_id":"'$FELIX'","type":"step","parent_id":"'$PROJ'","name":"Preisblatt fertig"}' \
  "$BASE/api/kpis"

# Counter hochzählen
curl -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{"delta":1}' "$BASE/api/kpis/$KPI_ID/adjust"

# Step erledigen
curl -X PATCH -H "$H" -H "Content-Type: application/json" \
  -d '{"completed":true}' "$BASE/api/kpis/$STEP_ID"
```

### Tasks

```bash
# Linear-Task erstellen (mit Meta)
curl -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{
    "title": "Funnel-Analyse",
    "userId": "'$FELIX'",
    "source": "hermes",
    "meta": { "phase": 1, "bereich": "dashboard", "context": "business" }
  }' "$BASE/api/tasks/create"

# Task aktualisieren (Phase/Bereich setzen)
curl -X PATCH -H "$H" -H "Content-Type: application/json" \
  -d '{"meta":{"phase":1,"bereich":"angebot"}}' "$BASE/api/tasks/<issue-id>"

# Task abschließen
curl -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{"identifier":"KAL-42"}' "$BASE/api/tasks/complete"

# Status setzen
curl -X PATCH -H "$H" -H "Content-Type: application/json" \
  -d '{"issueId":"<id>","status":"in-progress"}' "$BASE/api/tasks/status"

# Planning-Feed lesen (für Kai)
curl -H "$H" "$BASE/api/tasks/planning?userId=$FELIX"

# Kai-Suggestion schreiben
curl -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{"userId":"'$FELIX'","nextStep":"Preisliste finalisieren","followups":["Angebot verschicken"]}' \
  "$BASE/api/tasks/<issue-id>/assist"
```

### Finance

```bash
# Aktuelles Finance-Snapshot lesen
curl -H "$H" "$BASE/api/finance"

# EXIST-Snapshot lesen
curl -H "$H" "$BASE/api/finance?scenario=exist"

# EXIST-Ausgabe buchen
curl -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{
    "expense_date": "2026-07-01",
    "vendor": "Anthropic",
    "description": "API Credits",
    "amount_eur": 500,
    "paid_by": "Felix",
    "legal_entity": "private",
    "scenario": "exist",
    "funding_pot": "sachmittel",
    "fundability": "fundable",
    "reimbursable": "yes",
    "reimbursement_status": "open",
    "receipt_status": "available",
    "source": "hermes",
    "note": "Produktiv-Nutzung KI-Infrastruktur"
  }' "$BASE/api/expenses"
```

### Briefing & Day Plan

```bash
# Briefing generieren (Markdown)
curl -H "$H" "$BASE/api/briefing/build?userId=$FELIX" | jq .markdown

# Day Plan schreiben (Kai → Felix)
curl -X POST -H "$H" -H "Content-Type: application/json" \
  -d '{
    "userId": "'$FELIX'",
    "date": "2026-07-01",
    "generatedBy": "kai",
    "blocks": [
      {"start":"09:00","end":"10:30","title":"Angebots-Wizard MVP","issueId":"<id>"},
      {"start":"11:00","end":"12:00","title":"Kundengespräch","type":"meeting"}
    ]
  }' "$BASE/api/plan"
```

---

## Sync-Flow: KPI-Steps → Plan

```
1. Hermes liest KPI-Steps:
   GET /api/kpis?userId=<FELIX>
   → filtert type='step', completed=false

2. Hermes spiegelt in Plan (Phase 1, Bereich Angebot):
   POST /api/plan/sync-from-kpis
   { userId, phase: 1, bereich: "angebot", projectFilter: "Quote" }

3. Plan-Board (/dashboard/plan) zeigt sofort neue Tasks
   (revalidation passiert automatisch)

4. Hermes/Kai kann Tasks weiter verwalten:
   PATCH /api/plan/tasks/:id { status: "in_progress" }
   PATCH /api/plan/tasks/:id { phase: 2 }  ← nächste Phase
```

---

## Enums

| Feld | Werte |
|---|---|
| `bereich` | `dashboard`, `angebot`, `planung`, `kommunikation`, `ma_mobil`, `allgemein` |
| `phase` | `1` – `9` |
| `status` (Plan) | `todo`, `in_progress`, `on_hold`, `done`, `backlog` |
| `status` (Linear-PATCH) | `todo`, `in-progress`, `on-hold`, `done` |
| `source` (Task-Create) | `hermes`, `notion`, `linear` |
| `scenario` (Finance) | `current`, `exist` |
| `legal_entity` | `private`, `gmbh`, `chair` |
| `funding_pot` | `sachmittel`, `coaching`, `stipend`, `non_fundable`, `unclear` |
