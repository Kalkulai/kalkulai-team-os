# Plan B — Implementation Todo

Spec: `docs/superpowers/plans/2026-05-03-team-os-phase2-plan-b.md`

## User-Actions (parallel zu Code möglich)
- [ ] **U1** Vercel Password Protect aktivieren — https://vercel.com/leons-projects-1a41e692/kalkulai-team-os/settings/deployment-protection → "Vercel Authentication" → Standard Protection
- [ ] **U2** Telegram-Bot anschreiben (alle Personen `/start`) → `getUpdates` lesen → chat_ids in Supabase eintragen
- [ ] **U3** GitHub-Webhook für Hauptrepo registrieren (nach Task 7 Code-Push)
- [ ] **U4** `CRON_SECRET` + `GITHUB_WEBHOOK_SECRET` in Vercel ENV-Vars eintragen
- [ ] **U5** Vercel "Protection Bypass for Automation" Token erzeugen (für Webhook)

## Code-Tasks (Claude)
- [ ] **C3** `lib/telegram.ts` — Telegram-Sender
- [ ] **C4** `lib/briefing-format.ts` — Markdown-Formatter
- [ ] **C5** `app/api/briefing/send/route.ts` — Cron-Endpoint mit CRON_SECRET-Auth
- [ ] **C6** `lib/branch-parser.ts` — Branch → Linear-ID Regex
- [ ] **C7** `app/api/webhooks/github/pr-merged/route.ts` — HMAC-verify + Linear-Close
- [ ] **C8** `kalkulai/.claude/hooks/conflict-check.js` — Pre-Bash-Hook (anderer Repo)
- [ ] **C9** Tests + Push beider Repos

## Verify
- [ ] **V1** `curl -H "Bearer $CRON_SECRET" .../api/briefing/send` → 200 + Telegrams
- [ ] **V2** Vercel-Cron Job zeigt "Active" mit Schedule
- [ ] **V3** Test-PR mit `kal-99-*` Branch mergen → Linear-Issue auf Done
- [ ] **V4** `git checkout -b kal-1-test` im Hauptrepo → stderr-Warnung
