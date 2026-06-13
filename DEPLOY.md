# DEPLOY — feat/gtm-kpis (GTM KPIs + KPI↔Project/Campaign Link)

Manual go-live steps for the human operator. Nothing here was run against prod
by the agent — no migration applied, no deploy triggered.

## What this branch ships

1. Migration `supabase/migrations/029_kpi_project_link.sql`
   - `projects` table (id, owner_member_id → team_members, name, description, created_at).
   - `kpis` gains nullable `campaign_id` (→ campaigns), `project_id` (→ projects), `project_name`.
   - Indexes on `kpis(campaign_id)`, `kpis(project_id)`, `projects(owner_member_id)`.
   - Extends `kpis.source` CHECK to also allow `external:gmail`, `external:campaigns`.
2. New route `POST /api/kpis/sync` — Bearer auth, upserts external KPIs + week actuals.
3. New collector `lib/metric-collectors/gmail.ts` — wired into the snapshot loop.
   Derives `mails_sent` / `replies_received` / `meetings_booked` per campaign owner
   from existing `campaign_events` (no Gmail creds in the app).
4. Analytics + KpiTracker UI surface the new metrics and a campaign/project badge.

## Prereqs

- Supabase CLI linked to the team-os prod project (`jtakzjvaxctmnpzsszrf`).
- Vercel CLI linked to the `kalkulai-team-os` project.
- `DASHBOARD_API_SECRET` available locally (`vercel env pull`).

## Step 1 — Apply the migration to prod

The migration is **additive and idempotent** (all `if not exists` / `add column if not
exists`; the source CHECK is dropped+recreated with a superset, so existing rows stay valid).

```bash
# from repo root, with the CLI linked to jtakzjvaxctmnpzsszrf
supabase link --project-ref jtakzjvaxctmnpzsszrf   # only if not already linked
supabase db push
```

If this repo applies migrations via a different runner (e.g. a CI workflow or a
psql script against the pooled connection), use that instead — the file to apply is
`supabase/migrations/029_kpi_project_link.sql`. Manual psql fallback:

```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/029_kpi_project_link.sql
```

Verify:

```sql
select column_name from information_schema.columns
  where table_name = 'kpis' and column_name in ('campaign_id','project_id','project_name');
select to_regclass('public.projects');
```

## Step 2 — Deploy the app

```bash
vercel deploy --prod
```

## Step 3 — Re-run the snapshot so the GTM metrics populate immediately

The daily cron (~23:30 UTC) will pick up the gmail collector automatically, but to
backfill today's row right away:

```bash
curl -X POST https://kalkulai-team-os.vercel.app/api/metrics/snapshot \
  -H "Authorization: Bearer $DASHBOARD_API_SECRET"
# expect: {"ok":true,"results":{... ,"gmail":[{"memberId":"...","mails_sent":N, ...}]},"errors":[]}
```

The gmail collector only reads today's `campaign_events`. It records a 0 for any
owner with no events today (keeps sparklines dense). Historical days are not
backfilled — only forward from the first run.

## Step 4 — (Optional) Push external KPIs via the new sync route

Upsert a counter-KPI for a member, linked to the live Innung campaign, and set this
week's actual. Stable key is `(user_id, name, source)`; re-running updates in place.

```bash
curl -X POST https://kalkulai-team-os.vercel.app/api/kpis/sync \
  -H "Authorization: Bearer $DASHBOARD_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
        "kpis": [
          {
            "user_id": "bd695d11-0632-4a0a-b1d0-db43acf46a68",
            "name": "Innung Mails (Woche)",
            "unit": "Mails",
            "target": 80,
            "actual": 23,
            "source": "external:gmail",
            "campaign_id": "<innung-campaign-uuid>"
          }
        ]
      }'
# expect: {"ok":true,"upserted":1,"updated":0,"projects":0}
```

To also register a project and link a KPI to it:

```bash
curl -X POST https://kalkulai-team-os.vercel.app/api/kpis/sync \
  -H "Authorization: Bearer $DASHBOARD_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
        "projects": [
          { "owner_member_id": "bd695d11-0632-4a0a-b1d0-db43acf46a68",
            "name": "Partnerships GTM" }
        ],
        "kpis": [
          { "user_id": "bd695d11-0632-4a0a-b1d0-db43acf46a68",
            "name": "Termine gebucht (Woche)", "unit": "Termine",
            "target": 5, "actual": 1, "source": "external:campaigns",
            "project_name": "Partnerships GTM" }
        ]
      }'
```

Notes:
- `/api/kpis/sync` only accepts `external:gmail` / `external:campaigns`. `manual` and
  `hubspot:calls-week` KPIs stay managed via `/api/kpis`.
- External KPIs are read-only in the UI (the `+/-` adjust route still rejects any
  non-manual source with HTTP 409).
- `project_id` must reference an existing `projects` row; pass it together with a
  `projects` entry in the same call, or use `project_name` for a label-only badge.

## Rollback

- App: `vercel rollback` (or redeploy the previous commit).
- DB: the migration is additive. To fully revert:
  ```sql
  alter table kpis drop constraint if exists kpis_source_check;
  alter table kpis add constraint kpis_source_check
    check (source in ('manual', 'hubspot:calls-week'));  -- only if no external rows exist
  alter table kpis drop column if exists project_name;
  alter table kpis drop column if exists project_id;
  alter table kpis drop column if exists campaign_id;
  drop table if exists projects;
  ```
  Drop the CHECK revert only after confirming no `external:*` rows exist, otherwise
  the constraint add will fail.
