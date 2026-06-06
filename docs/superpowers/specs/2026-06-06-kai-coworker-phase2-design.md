# Kai Co-Worker — Phase 2 Slice 1 (Felix-only) — Design

**Datum:** 2026-06-06 · **Status:** Approved · Builds on `2026-06-06-task-metadata-design.md`.

## Vision (decomposed)
Kai = capable executing agent on agents-01 (terminal/delegate/browser/skills/memory, gpt-5.1). Gap to "coworker" = three seams: **see** tasks richly, **return** work per task, **show/approve** in the dashboard. team-os = system-of-record + surface + trigger; Kai-on-agents-01 = brain (no direct access from here → contract relayed to Leon/Kai). team-os already has the Hermes bridge (`sendToHermes`).

**Capability ladder:** (1) task context for Kai → (2) per-task smart next-step + **follow-up tasks** → (3) timeboxed day → (4) "Kai übernimm" pre-work via bridge → (5) learning loop.

## This slice = (1) + (2), Felix-only
Other two accounts untouched (no UI/hydration; gated by `isFelixMemberId`).

### DB — `024_task_assist.sql` (applied additively to team-os prod)
`task_assist`: `id`, `linear_issue_id text unique`, `user_id uuid`, `suggested_next_step text`, `suggested_followups jsonb default '[]'`, `created_at`, `updated_at`. Index on `user_id`.

### Lib
- `lib/task-assist.ts` (pure): `TaskFollowup` `{title, note?, effortMinutes?, context?, energy?}`, `TaskAssist` `{suggestedNextStep, suggestedFollowups[], updatedAt}`, `hasAssist`, `parseAssistInput`.
- `lib/task-assist-db.ts` (server): `getTaskAssistByIssueIds(ids)`, `upsertTaskAssist(issueId, userId, nextStep, followups)`.
- `UnifiedTask.assist?: TaskAssist | null`; `mergeTasks(..., assistByIssueId?)` attaches it.

### API
- `GET /api/tasks/planning?userId=` (requireActor; member only own data, bearer/Kai free): rich JSON — `{ date, timezone, capacity, tasks:[{id,identifier,title,status,dueDate,priority,important,urgent,quadrant,effortMinutes,energy,context,project,fixed,url,assist}], meetings:[{start,end,title}] }`. Kai's read source. Reuses `getIssuesForUser`, `getTaskMetaByIssueIds`, `getTaskAssistByIssueIds`, `getTodayEvents`, `mergeTasks`.
- `POST /api/tasks/[id]/assist` (requireActor tasks:write + `memberCanMutateIssue`): Kai writes `{ userId?, nextStep, followups }` → `upsertTaskAssist`. Owner = member's id, or bearer's `body.userId`.

### UI (TaskEditModal + card)
- Modal "Kai"-Sektion: `suggestedNextStep` + Liste der `suggestedFollowups`; je Followup **Übernehmen** (→ `POST /api/tasks/create` mit meta aus dem Followup, optimistisch ins Board via Board-Callback) + **Verwerfen** (beide entfernen den Followup und re-POSTen den Rest an `/assist`).
- Karte: dezentes **💡 Kai**-Badge wenn `hasAssist`.

### Kai-side contract (relayed to Leon/Kai — not built here)
Skill/cron: `GET /api/tasks/planning?userId=<FELIX>` (Bearer `HERMES_DASHBOARD_TOKEN`/`DASHBOARD_API_SECRET`) → for each task produce `nextStep` + `followups` → `POST /api/tasks/<issueId>/assist`. Exact curl + prompt provided separately.

## Verification
- Build green (Vercel). Migration applied (table verified).
- Felix board: a task with assist shows 💡 + modal section; Übernehmen creates a real task; Verwerfen removes the suggestion.
- `GET /api/tasks/planning?userId=FELIX` with bearer → 200 structured JSON.
- Other members: board unchanged.
