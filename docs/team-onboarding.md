# Team OS — Onboarding für Team-Members

## Was ist das

Internes Dashboard für unser Team. Zeigt deine offenen Linear-Tasks, heutigen Meetings, Wochenfortschritt (Tasks/Calls/Bugs), und für Devs den aktiven Branch. Schickt dir morgens 06:00 ein Telegram-Briefing.

## Du machst einmalig

1. **Telegram-Bot starten** — https://t.me/Kalkulai_team_os_bot → Start drücken. Damit kann der Bot dir Briefings schicken.
2. **Dashboard öffnen** — https://kalkulai-team-os.vercel.app/dashboard. Login mit Vercel-Account (Magic-Link an deine kalkulai-Mail).
3. **KPI-Ziele setzen** — `/settings` → Person auswählen → Tasks/Calls/Bugs-Ziel eintragen → Speichern.

## Tägliche Nutzung

- **Morgens** bekommst du Telegram mit Tasks + Meetings + Wochenstand.
- **Tasks abhaken** — auf `/dashboard` direkt die Checkbox vor einem Task klicken. Das schließt das Linear-Issue und erhöht deinen Tasks-Counter für die Woche.
- **Team-Übersicht** — `/dashboard/team` zeigt aktive Branches und KPIs aller Team-Members.

## Branch-Konventionen für Devs

Branch-Namen müssen den Linear-Identifier enthalten, damit Auto-Close beim Merge funktioniert:

```
feature/kal-42-add-login
fix/kal-99-broken-redirect
```

Wenn du `git checkout -b kal-NN-...` machst und das Issue ist bereits jemand anderem zugewiesen oder hat schon einen aktiven Branch, **warnt dich Claude Code in stderr**.

## PR mergen → Linear-Auto-Close

Sobald ein PR gemerged wird, schließt der GitHub-Webhook das passende Linear-Issue (matched über die ID im Branch-Namen oder PR-Titel) und setzt es auf "Done".

## Wenn was nicht funktioniert

- **Telegram kommt nicht** — `/start` an Bot, dann sag Leon Bescheid, er trägt deine `chat_id` in die DB.
- **Dashboard zeigt 0/0 KPIs** — kein Wochenziel gesetzt → `/settings` ausfüllen.
- **Auto-Close greift nicht** — Branch-Name oder PR-Titel hat keinen `kal-NN`-Identifier.
- **404 / Login-Loop** — du bist mit dem falschen Vercel-Account drin (das Projekt läuft auf `info@kalkulai.de`, nicht auf eurer privaten Mail).
