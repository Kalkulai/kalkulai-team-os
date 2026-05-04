# Handoff — KalkulAI Team OS

**Letzte Aktualisierung:** 2026-05-05

Dieses Dokument fasst zusammen, wo wir gerade stehen, damit du nach einem Claude-Code-Restart (z.B. nach Magic-MCP-Setup) sofort weitermachen kannst.

---

## Aktueller Stand

- **76 Vitest-Tests grün, 0 TS-Errors.**
- **Letzter lokaler Commit:** `780d040` — `feat(dashboard): time-aware greeting, clickable insights, sorted tasks, hubspot re-enabled`
- **Push zu origin/master ist hängengeblieben** (GitHub-Token muss erneuert werden, siehe Punkt 1 unten).
- **Production-URL:** https://kalkulai-team-os.vercel.app
- **Repo:** `C:\kalkulai\kalkulai-team-os` — Next.js 16 App Router, Vercel, Supabase, vitest.

---

## Was diese Session erledigt wurde

### Phase 4 (vorherige Sessions)
- Briefing-Inhalt grundsanieren (Top-3 Tasks, Notion-Headlines, Linear als Source of Truth für Tasks)
- 3 Telegram-Briefings live an Leon/Felix/Paul

### Diese Session
1. **Settings-Bug:** `/api/kpi/set-target` GET-Endpoint + Settings-Page lädt gespeicherte Targets bei Member-Wechsel.
2. **Commits-KPI:** Dashboard zeigt für Devs `Commits diese Woche: N`.
3. **SalesLogger Hydration:** `getSalesLogsTodayByType` → `initialCounts` Prop. Counter zeigt heutigen Stand statt 0.
4. **Team-Page:** Direkt-Lookup → `buildDailyBriefing` pro Member. Bugs-KPI für Devs ergänzt.
5. **HubSpot wieder aktiv:** Calls-KPI summiert HubSpot-CRM + sales_logs cold-calls. (User-Decision)
6. **Tageszeit-Begrüßung:** "Guten Morgen/Tag/Abend" abhängig von Stunde.
7. **Notion-Insights klickbar:** URL aus Page-ID (`https://www.notion.so/{id}`).
8. **Tasks priority-sorted:** Urgent + High zuerst (nicht truncated).
9. **Verbindungs-Status pro Person** in `/settings`: ✓/✗ Telegram, Linear, GitHub, Calendar, optional HubSpot — mit Hint was zu tun ist.
10. **`.gitignore` Duplikat raus, `.env.example` mit `GITHUB_WEBHOOK_SECRET` + `CRON_SECRET` ergänzt.**

---

## NÄCHSTE SCHRITTE (Priorität)

### Kritisch — sofort

**1. GitHub-Push fixen.**
`git push origin master` schlägt mit "Repository not found" fehl. Wahrscheinlich Auth-Cache abgelaufen. Optionen:
```
# Variante A: Credentials neu eintragen
git config --global credential.helper manager
git push origin master   # → Browser-Login

# Variante B: Personal Access Token
# 1) https://github.com/settings/tokens → Generate new token (classic) → repo + workflow
# 2) git remote set-url origin https://USERNAME:TOKEN@github.com/Kalkulai/kalkulai-team-os.git
# 3) git push origin master
```
Lokaler Commit `780d040` enthält 9 Files / 125 Insertions / 20 Deletions — geht nicht verloren.

### Hoch — UI-Refactor (mit Magic-MCP)

**2. Magic-MCP konfigurieren.** API-Key vorhanden (User hat ihn lokal). Ergänze in `.mcp.json` oder `~/.claude/settings.json`:
```
{
  "mcpServers": {
    "magic": {
      "command": "npx",
      "args": ["-y", "@21st-dev/magic@latest"],
      "env": {
        "API_KEY": "DEIN_KEY"
      }
    }
  }
}
```
Claude Code neu starten.

**3. UI-Refactor — Reihenfolge:**
- `app/dashboard/page.tsx` — Bento-Grid statt 2-Col, Glass-Cards, animierte KPI-Bars
- `components/SalesLogger.tsx` — moderner, touch-optimiert für Mobile
- `app/settings/page.tsx` — Verbindungs-Status visuell aufwerten
- `app/dashboard/team/page.tsx` — Team-Grid mit Avatar/Initial-Icons

**4. Mobile-Test.**
- Dashboard auf 375px (iPhone SE) und 390px (iPhone 14) testen
- SalesLogger: drei Buttons unter 360px Breite testen
- TaskList: Touch-Target mindestens 44px

### Mittel — Praxis

**5. Felix + Paul Calendar-Connect** (sobald deren Workspace-Account existiert):
- Sie öffnen `/settings` → "Mit Google Calendar verbinden" klicken → Google-Consent → done.

**6. Token-Rotation** (im Chat exposed):
- Vercel-Bypass-Token
- Supabase PAT
- CRON_SECRET, GITHUB_WEBHOOK_SECRET

### Niedrig — Future Features

**7. Wochenvergleich-KPI** — "letzte Woche 3/5, diese Woche 5/5" als Delta.
**8. SalesLogger Undo** — DELETE-Endpoint + 5-Min-Window.
**9. Echte Auth** statt `NEXT_PUBLIC_DASHBOARD_API_SECRET` (Phase 3).
**10. Notion-Insights Action** — "Bearbeitet" direkt aus Dashboard setzen.

---

## Wichtige Files

| Datei | Zweck |
|-------|-------|
| `lib/aggregator.ts` | Zentrale Briefing-Logik, alle Datenquellen |
| `lib/briefing-format.ts` | Telegram-Markdown |
| `lib/supabase.ts` | DB-Layer + KPI-Reads |
| `lib/notion.ts` | Notion Insights |
| `app/dashboard/page.tsx` | Hauptdashboard |
| `app/dashboard/team/page.tsx` | Team-Übersicht |
| `app/settings/page.tsx` | KPI-Targets + Calendar-Connect + Verbindungs-Status |
| `app/api/briefing/send/route.ts` | Cron-Endpoint |
| `app/api/webhooks/github/pr-merged/route.ts` | PR → Linear auto-close |

## Tests
- `npx vitest run` → 76/76 grün
- `npx tsc --noEmit` → 0 Fehler

## Production-Smoke
- `curl -H "Authorization: Bearer $CRON_SECRET" https://kalkulai-team-os.vercel.app/api/briefing/send`
- `/dashboard`, `/dashboard/team`, `/settings`
