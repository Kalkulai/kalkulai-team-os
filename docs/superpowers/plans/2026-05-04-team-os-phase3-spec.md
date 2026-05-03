# Team OS — Phase 3 Spec (planned, not yet built)

> **Status:** Spec-only. No implementation in this plan. Captures items deferred from Plan B Phase 2 plus growth ideas.

## Context

Plan B Phase 2 closed three core gaps (`bugs_fixed`, per-person Calendar, sales-call logging). Outcome: every team member sees personalised KPIs and meetings in the morning briefing. The items below were intentionally deferred — they make sense only after Workspace rollout, real user adoption, or production-grade traffic.

---

## P3-1 — Echte User-Auth (Supabase Magic Link + RLS)

**Why:** Vercel-Password-Schutz reicht für die Demo-Phase, aber sobald externe Stakeholder (Investoren, Pilot-Kunden) das Dashboard sehen sollen, brauchen wir personenbasierte Sessions und RLS, damit z.B. Paul nicht Felix' Telegram-IDs sehen kann.

**Scope:**
- `@supabase/ssr` + `@supabase/auth-helpers-nextjs`
- `/login`-Page mit Email-Magic-Link
- Middleware `middleware.ts` schützt `/dashboard`, `/settings`, leitet zu `/login`
- Session liest aktuell-eingeloggten User → ersetzt `members[0]` Default und `?member=<id>`-URL-Switcher
- Supabase RLS Policies pro Tabelle:
  - `team_members` SELECT: own-row + admin
  - `kpi_targets` UPDATE: own-row + admin
  - `sales_logs` INSERT: own-row
  - `kpi_daily` SELECT: own-row + admin
- Admin-Rolle (Leon) sieht alle, restliche nur sich selbst

**Estimated effort:** 4-6 Std + RLS-Tests

---

## P3-2 — `/dashboard/team` Sales-Calls-Aggregation

**Why:** Aktuell zeigt `/dashboard/team` nur Tasks-KPIs. Der neue `sales_logs`-Stream sollte auch in der Team-Übersicht aggregiert werden, damit Leon sieht wie viele Calls Paul diese Woche gelogged hat ohne Member-Switcher.

**Scope:**
- `lib/supabase.ts` neuen Helper `getAllSalesCallsThisWeek(): Promise<Map<userId, number>>`
- `app/dashboard/team/page.tsx` zeigt für `role === 'sales'` Member-Cards die `calls_made` aus diesem Map

**Estimated effort:** 30 Min

---

## P3-3 — Linear-Auto-Status-Update beim Branch-Erstellen

**Why:** Heute setzt der Conflict-Hook (`.claude/hooks/conflict-check.js`) nur eine Warnung. Eleganter wäre: wenn `git checkout -b kal-NN-foo` läuft, setzt der Hook das Linear-Issue automatisch auf "In Progress".

**Scope:**
- `.claude/hooks/conflict-check.js` erweitern: bei valider Linear-ID einen optional POST an neue Route `/api/linear/start-progress` machen
- Neue Route: `setIssueStatus(issueId, IN_PROGRESS_STATE_ID)`
- `LINEAR_IN_PROGRESS_STATE_ID` env-Var (state.id für "In Progress" — derzeit aus `getStates`-Probe bekannt)

**Estimated effort:** 1 Std

---

## P3-4 — HubSpot-Reaktivierung wenn VoIP

**Why:** Aktuell werden Cold-Calls per Klick via SalesLogger geloggt. Wenn Paul später HubSpot Calling oder Aircall aktiviert, sollten diese Calls automatisch in `sales_logs` einfließen ohne Doppel-Klicks.

**Scope:**
- HubSpot-Webhook für neue Call-Records einrichten
- Neue Route `/api/webhooks/hubspot/call` empfängt Webhook, schreibt in `sales_logs`
- HubSpot-Code in `lib/hubspot.ts` ist bereits da, nur Webhook-Handler fehlt

**Estimated effort:** 2 Std (inkl. HubSpot-Setup)

---

## P3-5 — Realtime-Dashboard via Supabase Realtime

**Why:** Heute muss man den Browser refreshen um KPI-Updates zu sehen. Wenn Felix einen Bug-Issue auf Done setzt, sollte Leons Team-View live `bugs_fixed +1` zeigen.

**Scope:**
- Client-Component subscriben auf `kpi_daily` und `sales_logs` Channels
- Optimistic state updates auf Member-Cards
- Vermutlich Migration zu Supabase Realtime Replication

**Estimated effort:** 3-4 Std

---

## P3-6 — Slack-Bridge als Telegram-Alternative

**Why:** Falls einer im Team Telegram nicht nutzen will/darf, sollte das Briefing auch über Slack verschickbar sein.

**Scope:**
- `lib/slack.ts` mit `sendSlackMessage(webhookUrl, blocks)`
- `team_members.slack_webhook_url` neue Spalte (Migration 004)
- Briefing-Send-Route iteriert über alle konfigurierten Channels (Telegram + Slack)

**Estimated effort:** 1.5 Std

---

## P3-7 — Vercel-Cron-Schedule auf Berlin-Zeit

**Why:** Aktuell läuft Cron `0 6 * * *` UTC = 08:00 Berlin Sommerzeit / 07:00 Winterzeit. User wollte 06:00 Berlin.

**Scope:**
- `vercel.json` Cron auf `0 4 * * *` UTC im Sommer / `0 5 * * *` UTC im Winter
- Pragmatisch: `0 5 * * *` ganzjährig (06:00 Winter / 07:00 Sommer) als Kompromiss

**Estimated effort:** 5 Min

---

## P3-8 — Tests-Coverage-Tooling

**Why:** Aktuell 69 Tests aber kein Coverage-Reporting. Pre-Commit-Hook der Coverage unter Threshold blockt würde Regression-Risk minimieren.

**Scope:**
- `@vitest/coverage-v8` als devDep
- `vitest run --coverage`
- GitHub-Actions-Workflow für CI
- Husky pre-push hook

**Estimated effort:** 2 Std

---

## Reihenfolge-Empfehlung

1. P3-7 (Cron-Zeit) — 5 Min Quick Win
2. P3-2 (Team-Sales-Aggregation) — 30 Min, klein
3. P3-3 (Linear-Auto-Progress) — sofort nutzbar
4. P3-1 (User-Auth) — vor jedem öffentlichen Sharing
5. P3-8 (Coverage-CI) — bevor Repo wächst
6. P3-5 (Realtime), P3-6 (Slack), P3-4 (HubSpot) — nach Bedarf

Diese Spec wird gepflegt — neue Items hier ergänzen statt unsortiert in `tasks/todo.md` aufnehmen.
