# Team OS Phase 1 — Dashboard Redesign & Claude Code Hook

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Notion als primäre Task/KPI-Source, Named Goals mit Subtask-Hierarchie, freie To-Do-Liste, vollautomatischer Branch-Workflow via Claude Code Hook — alles ohne LLM-Overhead im Workflow.

**Architecture:** Dashboard liest live aus Notion API (60s cache). Alle Writes gehen zurück an Notion. Supabase bleibt nur für team_members Config. Linear wird ausschließlich vom Claude Code Hook beschrieben (kein manuelles Ticket-Erstellen mehr nötig).

**Tech Stack:** Next.js 14 App Router, Notion API, Linear GraphQL, GitHub API, Google Calendar API, Supabase (team_members only), Telegram Bot API, Vercel Cron, Node.js Hook Script (LLM-frei)

---

## Kontext: Was bereits existiert

### Notion Workspace (Source of Truth)
- **Projects & Tasks DB** (`6bf6eab0-446e-828d-9d1b-878341185f90`) — Owner, Status (Not started/In progress/Done), Priority (High/Middle/Low), Effort (S/M/L/XL), Sub Item (self-relation = Subtasks), Linked Roadmap Goal (relation), Week (date), Points (formula auto), Department
- **Weekly Tracker DB** (`7386eab0-446e-82b8-9d4b-87b4730257ab`) — KW, Week (date range), Tasks (relation), Leon/Felix/Paul Points (rollup), Weekly Goal (number), Progress Bar (formula), Team Total
- **Kalkulai Roadmap DB** (`12d6eab0-446e-8314-950b-87ca1c4726fc`) — Endziele, verknüpft mit Projects & Tasks via "Linked Roadmap Goal"
- **Max-5-Regel**: Jede Person max 5 Tasks pro Woche (Team-Regel)

### Bestehender Code
- `lib/notion.ts` — getUnprocessedInsights(), countUnprocessedInsights()
- `lib/linear.ts`, `lib/github.ts`, `lib/calendar.ts`, `lib/hubspot.ts`
- `lib/aggregator.ts` — buildDailyBriefing() mit Promise.allSettled
- `lib/supabase.ts` — getAllMembers(), kpi_daily/kpi_targets (werden Phase 1 nicht mehr beschrieben)
- `app/dashboard/page.tsx` — MemberSwitcher, searchParams.member, force-dynamic
- `components/TaskList.tsx` — userId prop, optimistic checkbox
- `app/api/tasks/complete/route.ts` — Linear Done + Notion Status update
- `app/api/members/route.ts`, `/api/conflicts/route.ts`

---

## Seiten-Struktur

### `/dashboard` — "Mein Tag"
- Termine heute (Google Calendar) + Tasks heute (Notion, Owner=ich, Status≠Done, Priority-sorted) als 2-Spalten-Grid
- Tasks abhaken → PATCH Notion Status "Done"
- Quick-Add To-Do (`+` Button) → POST neue Notion-Page in Projects & Tasks
- KPI-Widget: Points diese Woche / Weekly Goal (Notion Weekly Tracker Rollup)
- Aktiver Branch (GitHub API)
- Mitglied-Switcher oben rechts (bereits gebaut)

### `/goals` — "Ziele & To-Dos"

**Bereich A — KPI-Ziele (hierarchisch)**
```
Roadmap Goal: "EXIST-Antrag" · Deadline: 15.05 · 3/7 Tasks ████░░░
  └── Zwischenziel: "Finanzplan" · 1/3 ███░░
       └── ☑ Zahlen aus Buchhaltung
       └── ☐ Excel befüllen
       └── ☐ Marius abstimmen
  └── Zwischenziel: "Pitch Deck" · 0/2 ░░░
```
- Anlegen: "+ Ziel", "+ Zwischenziel", "+ Task" — alle Writes → Notion
- Claude Code kann per API anlegen: `POST /api/goals/create`
- Aufklappbar (Accordion) pro Ziel
- Deadline-Badge, Progress-Bar pro Zwischenziel

**Bereich B — Freie To-Do-Liste**
- Einfache Checkboxen ohne Ziel-Verknüpfung
- `+` Hinzufügen → Notion Projects & Tasks Entry (kein Linked Roadmap Goal, Effort=S)
- Claude Code liest + hakt ab via `/api/todos`

### `/team` — Team-Übersicht (bleibt wie gehabt)

---

## Daten-Architektur

### Notion API — Neue lib/notion.ts Funktionen

```typescript
getMyTasks(ownerNotionId: string): Promise<NotionTask[]>
// Projects & Tasks: Status≠Done, Owner=person, sortiert nach Priority

getRoadmapGoals(ownerNotionId: string): Promise<RoadmapGoal[]>
// Roadmap Goals mit zugehörigen Zwischenzielen und Sub Items

setTaskStatus(pageId: string, status: 'In progress' | 'Done'): Promise<void>

createTask(params: {
  title: string;
  owner: string;
  linkedGoalId?: string;
  effort?: string;
}): Promise<string>

getWeeklyPoints(memberNotionUserId: string): Promise<{
  actual: number;
  goal: number;
  weekLabel: string;
}>
```

### Supabase — Vereinfacht

`team_members` bleibt unverändert.

Neue Tabelle:
```sql
create table if not exists task_links (
  id uuid primary key default gen_random_uuid(),
  notion_page_id text not null unique,
  linear_issue_id text,
  branch_name text,
  created_at timestamptz default now()
);
```

`kpi_daily` und `kpi_targets` werden nicht mehr beschrieben (bleiben für Rückwärtskompatibilität, kein neuer Code schreibt darauf).

---

## API Routes

### Bestehende Routes (anpassen)
- `app/api/tasks/complete/route.ts` — kpi_daily-Increment entfernen, nur Linear Done + Notion Status "Done"
- `app/api/kpi/set-target/route.ts` — bleibt inaktiv (deprecated)

### Neue Routes
```
GET  /api/todos?member={id}        → Notion Tasks (Owner filter, Status≠Done)
POST /api/todos/create             → Neue Notion Task (freie To-Do)
PATCH /api/todos/[id]/complete     → Notion Status → Done
GET  /api/goals?member={id}        → Roadmap Goals + Zwischenziele + Tasks
POST /api/goals/create             → Ziel/Zwischenziel/Task in Notion
GET  /api/context?member={id}      → Kompakter Kontext-Dump für Claude Code (<500 Tokens)
POST /api/work-on                  → Claude Code Hook Endpoint
POST /api/github-webhook           → PR merged → Notion Status "Done"
```

Alle Routes: Bearer-Auth via `DASHBOARD_API_SECRET`.

### `/api/context` Response-Format
```json
{
  "member": "Leon",
  "open_tasks": [
    { "id": "abc", "title": "EXIST-Pitch aktualisieren", "priority": "High" }
  ],
  "active_goals": [
    { "title": "EXIST-Antrag", "progress": "3/7", "deadline": "2026-05-15" }
  ],
  "meetings_today": [
    { "time": "10:00", "title": "Demo Call Musterbau" }
  ],
  "weekly_points": { "actual": 14, "goal": 20, "week": "KW18" },
  "active_branch": "feat/LIN-42-exist-pitch"
}
```

---

## Claude Code Hook — Work-On Workflow

**Datei:** `.claude/hooks/work-on.js` (reines Node.js, 0 LLM-Aufrufe)

**Ablauf bei `/work-on [task-titel oder notion-id]`:**
```
1. Notion API → Task suchen (title match oder direkte ID)
2. Conflict Check → Status "In progress" bei anderem Owner?
   → JA:  "⚠️ Felix arbeitet bereits daran (Branch: feat/LIN-38-xyz, vor 2h)"
           "Trotzdem fortfahren oder Felix assignen? (proceed/assign)"
   → assign: Notion Owner update + Telegram-Nachricht an Felix
   → proceed: weiter
3. Linear GraphQL → Issue erstellen (Title + Description aus Notion)
4. Branch-Name: {type}/LIN-{id}-{title-slug} (max 40 Zeichen)
5. git checkout -b {branch-name}
6. Notion → Status "In progress", Linear Issue ID + Branch Name schreiben
7. Supabase task_links → Row anlegen
8. Output: "✓ Branch feat/LIN-42-exist-pitch-deck erstellt"
```

**Branch-Naming Convention:**
```
feat/LIN-{id}-{slug}    ← neues Feature
fix/LIN-{id}-{slug}     ← Bug Fix
chore/LIN-{id}-{slug}   ← Wartung/Deps
```
Slug: Titel lowercased, Sonderzeichen → `-`, max 40 Zeichen, keine Umlaute.

**Auto-Complete (Rückweg):**
PR gemergt → GitHub Webhook → `/api/github-webhook` → Notion Status "Done" → task_links updaten → Linear Ticket "Done"

**settings.json Registrierung:**
```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Bash",
      "hooks": [{ "type": "command", "command": "node .claude/hooks/branch-guard.js" }]
    }]
  }
}
```

---

## Telegram Morning Briefing

**Vercel Cron:** täglich 8:00 Uhr → `app/api/cron/briefing/route.ts`

**Template (LLM-frei):**
```
📅 {Wochentag}, {Datum} — Guten Morgen {Name}

🎯 Deine Prioritäten heute:
  • {Task 1 title} ({Priority})
  • {Task 2 title}
  • {Task 3 title}

📞 Meetings heute:
  • {Zeit} — {Titel}

📊 Woche KW{N}:
  {Name} Points: {actual} / {goal}  {progressbar}

💡 {N} Notion Insights warten
```

**Telegram `/todo [text]` Befehl:**
Empfängt Nachricht → lookup `telegram_chat_id` in team_members → POST Notion Task (Owner=Person, Effort=S, kein Linked Goal) → Confirmation-Reply

---

## TypeScript Types (Erweiterungen)

```typescript
export interface NotionTask {
  id: string;
  title: string;
  status: 'Not started' | 'In progress' | 'Done' | 'On Hold';
  priority: 'High' | 'Middle' | 'Low' | null;
  effort: 'S (≤ 1 Hour)' | 'M (1 - 3 Hours)' | 'L (½–1 Working Day 4–8 h)' | 'XL (1-2 working days)' | null;
  ownerIds: string[];
  subItems: NotionTask[];
  linkedGoalId: string | null;
  linearIssueId: string | null;
  branchName: string | null;
  notionUrl: string;
}

export interface RoadmapGoal {
  id: string;
  title: string;
  deadline: string | null;
  milestones: Milestone[];
  progress: { done: number; total: number };
}

export interface Milestone {
  id: string;
  title: string;
  tasks: NotionTask[];
  progress: { done: number; total: number };
}

export interface WeeklyKpi {
  memberName: string;
  actual: number;
  goal: number;
  weekLabel: string;
}
```

---

## Neue Env-Variablen

```bash
NOTION_PROJECTS_TASKS_DB_ID=6bf6eab0-446e-828d-9d1b-878341185f90
NOTION_WEEKLY_TRACKER_DB_ID=7386eab0-446e-82b8-9d4b-87b4730257ab
NOTION_ROADMAP_DB_ID=12d6eab0-446e-8314-950b-87ca1c4726fc
NOTION_USER_ID_LEON=2b559694-8e90-4a61-8f93-6bc57d7a2a05
NOTION_USER_ID_FELIX=43d482ab-5587-4162-948b-40632456e888
NOTION_USER_ID_PAUL=59106230-8e76-4cb2-9e8c-d0c1de24e8e4
```

---

## Einmalige Setup-Schritte (User)

1. **Notion:** 2 neue Properties in Projects & Tasks: `Linear Issue ID` (Text) + `Branch Name` (Text)
2. **Supabase:** Migration `task_links` Tabelle ausführen
3. **Vercel:** neue Env-Variablen eintragen
4. **GitHub:** Webhook für PR-Events auf `/api/github-webhook` konfigurieren

---

## Abgrenzung: Was Phase 1 NICHT enthält

- Daily Dump / Weekly Review Generator (→ Phase 2)
- Auto-Dashboard Generierung am Sonntag (→ Phase 3)
- Obsidian / Hostinger Integration (→ Phase 4)
- HubSpot bleibt im Code, wird nicht aktiv genutzt
