@AGENTS.md

## Claude Code — Dashboard-Zugang

Claude Code interagiert mit dem Team-OS Dashboard direkt ueber die REST-API (kein MCP-Server).

### Wrapper-Script

```powershell
cd C:\kalkulai\kalkulai-team-os
.\scripts\team-os.ps1 members
.\scripts\team-os.ps1 health leon
.\scripts\team-os.ps1 kpis leon
.\scripts\team-os.ps1 create-task leon "Task-Titel"
.\scripts\team-os.ps1 briefing felix
.\scripts\team-os.ps1 crons           # Hermes-Cron-Status via SSH
```

Auth: liest `DASHBOARD_API_SECRET` aus `.env.local`. Niemals `NEXT_PUBLIC_DASHBOARD_API_SECRET` verwenden.
Base-URL: `https://kalkulai-team-os.vercel.app` (hardcoded, ueberschreibbar via `TEAM_OS_BASE_URL`).

### Test-Mode

Hermes laeuft aktuell mit `KALKULAI_TEAM_MANAGER_TEST_USER=bd695d11-...-db43acf46a68` (Leon).
Beim Anlegen von Tasks/KPIs fuer Felix oder Paul pruefen ob der Cron im Test-Mode ist.

### Hermes-Crons (auf agents-01)

| Cron-ID | Name | Schedule |
|---|---|---|
| 820b482c0c62 | weekly-review-mittwoch | Mittwoch 20:00 CEST |
| 48ad93dd7650 | weekly-review-sonntag | Sonntag 20:00 CEST |

Resume nach erfolgreichen Tests:
```bash
ssh leon@178.104.220.160 "sudo docker exec kalkulai-hermes /opt/hermes/.venv/bin/hermes cron resume 48ad93dd7650"
```

Manueller Test-Run:
```bash
ssh leon@178.104.220.160 "sudo docker exec kalkulai-hermes /opt/hermes/.venv/bin/hermes cron run 48ad93dd7650"
```

## Commit-Message-Convention (Pflicht für Daily-Recap-Coverage)

Jeder Commit, der ein Linear-Ticket adressiert, MUSS einen `closes` / `fixes` / `resolved` Marker enthalten. Sonst erscheint der Commit-Outcome nicht im `daily-recap` (audit_recap.py filtert auf diesen Marker um WIP-commits auszuschließen).

**Format:**
```
<type>(<scope>): <description> (closes KAL-XX)
```

**Beispiele:**
- `feat(quote-editor): Position-Delete-Button (closes KAL-112)`
- `fix(task-tracker): auto-assign on /task-set (closes KAL-127)`
- `polish(quote-editor): Mockup-Alignment (closes KAL-92)`

**Side-Effects:**
- Linear-Ticket geht automatisch auf Done (via post-bash Hook `task-router-post-bash.js`)
- Commit erscheint in `daily-recap` unter `github_commits_with_closes`
- audit_recap.py Coverage-Score `commits_with_marker_pct` steigt
- `closed_linear_with_pr_pct` steigt zusätzlich wenn der **PR-Title** das KAL-XX enthält (post-bash Hook injiziert das jetzt automatisch beim `gh pr create`)

**Soft-rule:** WIP-Commits (rebase, format, refactor ohne Outcome) brauchen keinen Marker. Aber alles was ein Ticket schließt, muss den Marker tragen.
