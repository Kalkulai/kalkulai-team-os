# Launch-Plan — Team OS Go-Live

**Erstellt:** 2026-05-06 (abends)
**Ziel:** Morgen Go-Live nach Test-Pass. Alle Baustellen identifiziert, priorisiert, mit konkreten Next-Steps.

---

## TL;DR — was MUSS vor Go-Live passieren

1. **End-to-End Test** auf Handy (Leon) → Bugs identifizieren
2. **Calendar-Connect fixen** (kritisch wenn Meetings korrekt sein sollen) ODER bewusst entscheiden: bleibt am Fallback
3. **Telegram-Briefing-Sync** entscheiden (Stale-Risiko, siehe Punkt 4 unten)
4. **Visual-Polish** (Leon explicit angefragt — mehr Akzent/Hierarchie)
5. **Felix + Paul Onboarding** (Workspace-Login + Calendar-Connect)
6. **Push-Trigger:** Telegram-Nachricht an Team „TeamOS ist live, hier der Link"

---

## Aktueller Live-Stand (Stand 2026-05-06 nach letztem Deploy `dpl_65dCJu74c5…`)

### Funktioniert
| Feature | Status |
|---|---|
| Dashboard `/dashboard` | ✓ live, zeigt: Hero (greeting + branch) / Tasks (Linear) / Meetings / Projekte / KPIs / SalesLogger (sales-only) |
| Tasks: Inline-Add | ✓ legt direkt Linear-Issue an, dir assigned |
| Tasks: Häkchen | ✓ schließt Issue in Linear ab |
| Projekte: Anlegen + Steps + Häkchen | ✓ Phase 1 fertig |
| KPIs: Anlegen + +/- Counter | ✓ funktioniert |
| Settings `/settings`: KPI/Projekt-Manager | ✓ Toggle Counter/Projekt + Step-Add |
| Settings: Connection-Status pro Person | ✓ zeigt Telegram/Linear/GitHub/Calendar/HubSpot |
| Team `/dashboard/team`: Branches + per-Member-Cards | ✓ live (zeigt aber alte hardcoded KPI-Bars — siehe Issue #5 unten) |
| Workspace `@kalkulai.de` | ✓ Leon/Felix/Paul angelegt, Group `info@` aktiv, Filter `kalkulai.tech@gmail.com → info@` läuft |
| Telegram-Bot | ✓ alle 3 chat-ids gespeichert |
| Migration 005 | ✓ live in Supabase |
| MemberSwitcher Bug (UUID statt Name) | ✓ gefixt |
| `scripts/apply-migration.ts` | ✓ funktioniert via SUPABASE_DB_URL |

### Kaputt / unvollständig
| # | Issue | Severity | Was zu tun |
|---|---|---|---|
| **1** | **Calendar-Connect** `redirect_uri_mismatch` | hoch (UX-Eindruck), aber blockiert nicht da Fallback funktioniert | Neuen Web-OAuth-Client in Google Cloud Console erstellen (alter ist Type "Desktop"). Dann GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET in Vercel updaten. Walkthrough siehe unten. |
| **2** | **Visual zu dezent** — Leon explizit "mehr visuelles" | mittel | Akzent-Borders pro Card-Typ (sky=Projekte, emerald=KPIs, amber=Meetings), Lucide-Icons in Headers, Bento-Grid dichter, ggf. Hero-Card mit großer KPI/Greeting-Animation |
| **3** | **Tasks-Card Position** Leon: "mehr seitlich" | niedrig | Layout: Tasks (4-col) bleibt links, vielleicht enger machen oder rechts platzieren |
| **4** | **Telegram-Briefing zeigt stale Tasks/Calls/Bugs** | mittel | `lib/aggregator.ts` + `lib/briefing-format.ts` lesen noch aus `kpi_targets`/`kpi_daily` (Legacy). Da Leon nun KPIs in neuer Tabelle anlegt, sind Briefing-Werte stale. **Lösung:** entweder (a) aggregator umstellen auf neue `kpis`-Tabelle, ODER (b) Telegram-Briefing temporär deaktivieren bis Phase 2, ODER (c) Briefing nur Meetings + Tasks zeigen (KPIs raus) |
| **5** | **Team-Page hardcoded KPIs** | niedrig | `app/dashboard/team/page.tsx` zeigt für jedes Mitglied alte 3 KpiBars (Tasks/Bugs/Calls). Wenn neues KPI-System läuft, sollte Team-Page das auch reflektieren — oder Card vereinfachen auf "X aktive Tasks, Y Projekte" |
| **6** | **Empty-States visuell schwach** | niedrig | Tasks/Projekte/KPIs zeigen Text "Noch nichts angelegt…" — könnte ansprechender sein (Icon + Call-to-Action-Button) |

### Geparkt für später (Phase 2+)
- **KPI Auto-Source** — Counter "Tasks erledigt" aus Linear auto-zählen
- **Tree-Rendering** für tief verschachtelte Projekte
- **Drag-Sort** für KPIs/Projekte
- **Customer-Insights** wieder aktivieren (Notion-Integration) — falls gewünscht
- **Hermes-Integration** — Leon setzt's gerade auf, wir verbinden später
- **Token-Rotation** — CRON_SECRET, GITHUB_WEBHOOK_SECRET, Vercel-Bypass-Token, Supabase-PAT (waren in Chat-Transkripten exposed) — sollten rotiert werden
- **lp-kai → Kalkulai-Org-Collaborator** — damit `git push` direkt geht statt nur via vercel CLI

---

## Test-Plan für morgen früh (Leon, ~10 Min)

Mach das auf dem Handy + Laptop (Mobile + Desktop checken).

### A) Smoke Test (3 Min)
1. https://kalkulai-team-os.vercel.app/dashboard öffnen
2. Member-Dropdown wechseln zwischen Leon/Felix/Paul → korrekter Name? Tasks/Projekte ändern sich?
3. Inline-Task-Add: "TestTask" eintippen + → erscheint? In Linear nachschauen?
4. Meeting-Card zeigt "Meya Einrichtung" oder andere echte Termine? (= Fallback-Kalender funktioniert)

### B) Projekt-Workflow (3 Min)
1. /settings → Toggle "Projekt" → Name "TestProjekt" + due_date "2026-05-07" → anlegen
2. + Step → "Step1" + Datum → adden → 2-3x wiederholen
3. /dashboard → Projekte-Card zeigt TestProjekt mit Progress 0/3?
4. Häkchen klicken → Counter geht hoch + Bar färbt sich?
5. Aufm Handy (mobile) genauso?

### C) KPI-Workflow (2 Min)
1. /settings → Toggle "Counter" → "TestKPI" + Einheit + Ziel 5 → anlegen
2. /dashboard → KPIs-Card zeigt TestKPI mit 0/5?
3. + klicken 3x → 3/5 (60% amber)?
4. + 2x mehr → 5/5 (100% emerald)?

### D) Mobile-Specific (2 Min)
1. Alle Tap-Targets groß genug? (Plus-Button bei Tasks, +/- bei KPIs, Step-Checkbox)
2. Scrollen flüssig?
3. Layout bricht nirgends?

→ **Falls alles ✓:** Ready für Go-Live. Falls Bugs: aufschreiben, morgen mit neuem Claude fixen.

---

## Calendar-Connect-Walkthrough (falls morgen gefixt werden soll)

Aktuell Fehler: `redirect_uri_mismatch`. Root: aktueller OAuth-Client ist Type "Desktop".

**Schritte:**
1. https://console.cloud.google.com → Projekt `kalkulai-team-os`
2. APIs & Services → Anmeldedaten → **+ Anmeldedaten erstellen → OAuth-Client-ID**
3. Anwendungstyp: **Webanwendung**
4. Name: `kalkulai-team-os-web`
5. Autorisierte JavaScript-Quellen: `https://kalkulai-team-os.vercel.app`
6. Autorisierte Weiterleitungs-URIs:
   - `https://kalkulai-team-os.vercel.app/api/oauth/google/callback`
   - `http://localhost:3000/api/oauth/google/callback` (für Dev)
7. Erstellen → kriegst Client-ID + Client-Secret (Secret nur einmal sichtbar — kopieren)
8. Leon paste an Claude → Claude führt aus:
   ```bash
   echo "<id>" | vercel env add GOOGLE_CLIENT_ID production --force
   echo "<secret>" | vercel env add GOOGLE_CLIENT_SECRET production --force
   vercel deploy --prod
   ```
9. /settings → "Mit Google Calendar verbinden" → testen

---

## Felix + Paul Onboarding-Workflow

Sobald Test grün:

1. Telegram-Nachricht an beide:
   ```
   Team OS ist live → https://kalkulai-team-os.vercel.app

   Bitte 5 Min:
   1. Workspace-Login: https://mail.google.com mit dein@kalkulai.de + Initial-PW
      (PW musst du beim ersten Login ändern)
   2. Auf https://kalkulai-team-os.vercel.app/settings:
      - Wähl deinen Namen
      - "Mit Google Calendar verbinden" klicken
      - Login mit deiner @kalkulai.de Mail
   3. Spiel mit KPIs + Projekten rum, sag wenn was komisch ist
   ```
2. Falls beide bestätigen "läuft" → live offiziell

---

## Optimaler Workflow morgen früh (Schritt für Schritt)

### Schritt 0 — neuer Chat starten
Im Claude Code, neuer Chat im Projektverzeichnis. Erste Nachricht:
```
Lies tasks/launch-plan.md. Wir gehen heute live. Erstmal alle offenen Punkte mit mir durchgehen, einzeln entscheiden welche wir vor Go-Live noch fixen, dann der Reihe nach abarbeiten. Beginne mit Quick-Smoke-Test-Erinnerung damit ich es zuerst selbst durchgehe, danach reden wir.
```

### Schritt 1 — Smoke Test (du selbst)
Test-Plan A-D (~10 Min, du auf Handy/Laptop). Schreib alle Bugs/UI-Komisches auf.

### Schritt 2 — Issues-Triage mit Claude
Claude geht mit dir:
- Deine Bug-Liste durch (jeden einzeln einordnen: blocker / nice-to-have / parken)
- Die "Kaputt/unvollständig"-Tabelle oben durch (Calendar / Visual / Tasks-Layout / Telegram-Sync / Team-Page)
- Pro Item Entscheidung: jetzt fixen / vor Go-Live deferred / nach Go-Live

### Schritt 3 — Fix-Sprint
Claude implementiert die "JETZT FIXEN"-Liste in der vereinbarten Reihenfolge. Du testest jeden Fix kurz.

### Schritt 4 — Final Visual-Pass
Wenn Visual-Wunsch dabei ist: Claude macht einen ~30-60 Min Polish-Pass (Akzent-Borders, Icons, Animation, Hero-Card-Verbesserung, etc.). Du gibst Feedback live.

### Schritt 5 — Go-Live-Push
1. Final commit + deploy
2. Felix + Paul Telegram-Nachricht
3. Du markierst intern "live"
4. Champagner

---

## Hand-Off-Kontext für neuen Claude

### Repo-Stand
- Branch: `master`, ~9 commits ahead of origin (lp-kai kein org-write, Push blockiert — wir deployen direkt via Vercel CLI)
- Letzter Commit: `ab44855 feat(kpis): project type with sub-step checklist + dashboard split`
- Letzter Production-Deploy: `dpl_65dCJu74c5Uzfu1SXUPXQyAEv5eR` aliased zu `https://kalkulai-team-os.vercel.app`

### Tools verfügbar
- **Vercel CLI** ✓ eingeloggt → `vercel deploy --prod` mit User-OK
- **Supabase Direct DB** ✓ via `SUPABASE_DB_URL` in `.env.local` → `npx tsx scripts/apply-migration.ts <file>`
- **Supabase MCP** ✗ offline (`npx ENOENT`) — nicht nutzen
- **Google Cloud Console** ✗ kein Zugriff — Leon muss selbst klicken
- **GitHub MCP** ✓ aber lp-kai hat kein org-write
- **Linear/HubSpot/Notion** via lib/* (API-Keys in env)

### Claude-Settings
- Auto-Mode: könnte aus sein, fragen
- Gate-Friction: aus mit `ECC_GATEGUARD=off` falls heute aktiv blieb (siehe `tasks/phase1-status.md` für Details)
- User: deutsche Antworten, terse, action-oriented

### Bekannte Quirks
- `package-lock.json` modified-Status oft kosmetisch — wenn nichts an deps geändert: nicht committen
- Zeilenenden-Warnings (LF/CRLF) bei jedem commit auf Windows — ignorieren
- Vercel-Git-Author-Verification: commits MÜSSEN `info@kalkulai.de` als Author haben (lokales `git config user.email` ist gesetzt — bei amend/rebase aufpassen)

---

## Files-Übersicht (Phase 1 betreffend)

```
app/
  api/kpis/
    route.ts              GET list, POST create (counter|project|step)
    [id]/route.ts         PATCH update (incl. completed/due_date), DELETE
    [id]/adjust/route.ts  POST {delta} for counter +/-
  dashboard/page.tsx      6-col bento, Projekte+KPIs split
  settings/page.tsx       Person-Switcher + KpiManager + Calendar-Connect + Verbindungs-Status

components/
  KpiManager.tsx          Settings-CRUD: Toggle Counter|Projekt + Step-inline-add
  KpiTracker.tsx          Dashboard-Counters: filter type=counter, +/-buttons
  ProjectsTracker.tsx     Dashboard-Projects: type=project, eingerückte Step-Checkboxes
  KpiBar.tsx              LEGACY (alt, hardcoded — wird noch von Team-Page genutzt)

lib/
  kpis.ts                 listUserKpis (alle types), createKpi, update, adjustActual, delete
  aggregator.ts           LEGACY pfade für Tasks/Calls/Bugs counter (Telegram-Briefing!)

supabase/migrations/
  004_kpis.sql            kpis + kpi_weeks Tabellen
  005_kpi_types.sql       type/due_date/completed Spalten

scripts/
  apply-migration.ts      Tsx-Runner für SQL via direct pg
  check-members.ts        Diagnose: alle team_members + Connection-Status
```

---

## Start-Prompt für morgen (kopieren-pasten)

```
Lies tasks/launch-plan.md. Wir gehen heute live. Erstmal alle offenen Punkte mit mir durchgehen, einzeln entscheiden welche wir vor Go-Live noch fixen, dann der Reihe nach abarbeiten. Beginne mit Quick-Smoke-Test-Erinnerung damit ich es zuerst selbst durchgehe, danach reden wir.
```
