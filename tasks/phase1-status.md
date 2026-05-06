# Phase 1 — Goals/Projects/KPIs Unification

**Date:** 2026-05-06
**Hand-off Reason:** Gate-Friction abgestellt via `ECC_GATEGUARD=off` für diese Session.

## Mission
Erweiterung des KPI-Systems um Project-Type mit Sub-Steps. 4-Bucket-Konzept umsetzen:
1. **KPIs** (counter): numerische Wochenziele (existiert)
2. **Projects** (project + step): mehrtägige Initiativen mit abhakbaren Sub-Steps (NEU)
3. **Tasks**: Linear-Issues (existiert, unverändert)
4. **Termine**: Calendar (existiert, unverändert)

## Schema-Änderung (NEW)
Migration `supabase/migrations/005_kpi_types.sql` ist **lokal angelegt**, **noch NICHT in Supabase angewandt**. Inhalt:

```sql
alter table kpis add column if not exists type text not null default 'counter'
  check (type in ('counter', 'project', 'step'));
alter table kpis add column if not exists due_date date;
alter table kpis add column if not exists completed boolean not null default false;
create index if not exists idx_kpis_type on kpis(type);
```

User muss diese Migration in Supabase Dashboard SQL-Editor anwenden (manuell, weil Supabase MCP heute offline `npx ENOENT`).

## Bereits done (lokal, uncommitted)
- ✓ Migration-File geschrieben (005_kpi_types.sql)
- ✓ `types/index.ts`: `KpiType`, `Kpi.type/due_date/completed`, `KpiWithWeek`
- ✓ `lib/kpis.ts`: `listUserKpis` lädt alle types, `kpi_weeks` lookup nur für counter; `createKpi` nimmt optional `type`/`due_date`, skip kpi_weeks bei non-counter; `updateKpiDefinition` nimmt `due_date`/`completed`
- ✓ `app/api/kpis/route.ts`: POST nimmt optional `type`/`due_date`
- ✓ `app/api/kpis/[id]/route.ts`: PATCH nimmt `due_date`/`completed`
- ✓ `components/KpiTracker.tsx`: Filter auf `type === 'counter'` — zeigt nur noch Counter

## Was NOCH zu tun ist

### 1. `components/ProjectsTracker.tsx` (NEU)
- Fetched `/api/kpis?userId=…`, filter type='project' und type='step', gruppiere steps unter parent_id
- Pro Project: Name, optional due_date, Progress (`done/total` Steps), eingeklappte Liste der Steps
- Pro Step: Checkbox (toggle via PATCH `/api/kpis/<step-id>` body `{completed: true|false}`), Name, optional due_date
- Empty-State: "Noch keine Projekte. Geh zu /settings, um eines anzulegen."
- Style: glass-card-style passend zum Rest, Tone: blau für Projekte (vs emerald für KPIs)

### 2. `components/KpiManager.tsx` erweitern
- Im Anlege-Form: Toggle/Tabs **"Counter | Projekt"**
- Counter-Tab: Name, Einheit, Ziel (existiert)
- Projekt-Tab: Name, optional Fälligkeitsdatum (native `<input type="date">`)
- Pro existierendem Projekt-Item in Liste: **+ Step** Button öffnet Inline-Form für Step (Name + optional due_date), ruft POST `/api/kpis` mit `{user_id, type:'step', parent_id:<project-id>, name, due_date}`
- Pro Step-Item in Liste: zeigt Name + due + checkbox, kann gelöscht werden
- Steps werden eingerückt unter dem Project gerendert

### 3. `app/dashboard/page.tsx` Layout
- Aktuell: Hero(6) / Tasks(4) + Meetings(2) / Diese-Woche=KpiTracker(3 oder 6) / SalesLogger(3 wenn role=sales)
- Neu: Hero(6) / Tasks(4) + Meetings(2) / **Projekte=ProjectsTracker(3) + KPIs=KpiTracker(3)** / SalesLogger(6 wenn role=sales — separate Reihe)
- Card-Header für Projekte: "Projekte" mit Link "anpassen" → /settings
- Card-Header für KPIs unverändert

### 4. Supabase-Migration anwenden
User muss SQL aus `supabase/migrations/005_kpi_types.sql` in Supabase Dashboard SQL-Editor pasten + Run klicken. **Vor Deploy.**

### 5. Verify
- `npx tsc --noEmit` — clean
- `npx vitest run` — 76/76 grün

### 6. Commit + Deploy
- `git add app/api/kpis app/dashboard/page.tsx components/KpiManager.tsx components/KpiTracker.tsx components/ProjectsTracker.tsx lib/kpis.ts supabase/migrations/005_kpi_types.sql types/index.ts`
- Commit-Message: `feat(kpis): add project/step types with sub-step checkboxes`
- `vercel deploy --prod` (User-Approval da)

## Aktuelle Working-Tree (nicht committed seit letztem Commit `049d376`)
- modified: `app/api/kpis/route.ts`, `app/api/kpis/[id]/route.ts`, `components/KpiTracker.tsx`, `lib/kpis.ts`, `types/index.ts`
- untracked: `supabase/migrations/005_kpi_types.sql`

## Production State
- Live: https://kalkulai-team-os.vercel.app
- Letzter Production-Deploy: `dpl_EAVASQcpQYQvNTByvvpBfALtcGxs` (KPI-Sprint Phase 0 = pure counter)
- Migration 004 (kpis + kpi_weeks Tabellen) bereits live in Supabase

## User-Präferenzen (wichtig)
- German responses, English code/commits
- Terse, no chatter, no docs unless asked
- No `any` types
- Read before write
- Auto-Mode aktiv → Action over Planning
- "Ballern" = volle Geschwindigkeit, ohne dauernd Rückfragen

## Calendar-Connect — geparkt
`redirect_uri_mismatch` Fehler. User braucht **NEUEN** Web-OAuth-Client in Google Cloud Console (aktueller ist Type "Desktop" — supportet keine HTTPS Redirect-URIs). Nicht Phase 1, später.

## Brainstorm-Skill
Skill `superpowers:brainstorming` wurde invoked und das Design wurde mit User durchgesprochen. User hat mit "go" approved. HARD-GATE des Skills ist erfüllt — implementation darf laufen.

## Prompt für neue Session
> "Lies tasks/phase1-status.md und mach exakt da weiter wo wir aufgehört haben. Ballern bitte."
