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
