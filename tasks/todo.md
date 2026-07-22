# Iteration 3 — Sales OS v3 (Stage Pipeline + CCS + Profile)

Stand: 2026-07-22 | Branch: feat/sales-v3

## Ziel
Vollständige Sales-OS-Überarbeitung: nativer `stage`-Funnel (7 Stufen), überarbeitete
Cold-Call-Session mit Pre-Call-Brief, deutlich reicheres Lead-Profil.

## DB-Migration (037_sales_stage.sql)
- [x] `stage text NOT NULL DEFAULT 'prospecting' CHECK (enum)` + `stage_entered_at`
- [x] `ai_summary text` (gecachte KI-Zusammenfassung)
- [x] `cold_streak int DEFAULT 0` (aufeinanderfolgende No-Answer-Calls)
- [x] Backfill stage aus pilot_status + HubSpot-status

## Backend
- [x] types/sales.ts — SalesStage type, neue Felder, relationship_health
- [x] lib/sales-os.ts — updateCompanyStage, updateAiSummary, updateColdStreak
- [x] PATCH /api/sales/companies/[id] — stage handler
- [x] POST /api/sales/companies/[id]/brief — AI-Zusammenfassung via Hermes
- [x] POST /api/sales/activities/log-call — cold_streak-Update nach Outcome

## Frontend
- [x] SalesDashboard.tsx — kompletter Rebuild:
       • Funnel-View (7 Stufen, Counts, Klick filtert)
       • Kanban-Pipeline (discovery / evaluation / pilot)
       • ColdCallSession: tiered queue, pre-call brief, Einwand-Drawer
       • Lead-Profil: stage-select, health-badge, ai_summary-Tab, cold_streak
- [x] globals.css — neue CSS-Klassen

## Deploy
- [ ] supabase db push (Migration via Supabase CLI)
- [ ] TypeScript-Check sauber
- [ ] PR + Merge zu master → Vercel auto-deploy
