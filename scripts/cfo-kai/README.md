# CFO-Kai → Team-OS Finance Automation

End-to-end so the dashboard finance section always reflects the live Google
Sheets — edit a sheet, the numbers update; upload a new plan, just re-trigger
the Hermes cron.

```
Google Sheets (3 canonical)
  └─ forecasting.py (Hermes, venv-finance)   → writes finance-kpis.json  (FinanceData)
  └─ push_finance_snapshot.py (this dir)     → POST /api/finance/snapshot → Supabase finance_snapshots
                                              → GET /api/finance          → Dashboard (live)
```

## One-time setup (per environment)

1. **Deploy** the team-os branch carrying `/api/finance`, `/api/finance/snapshot`
   and migration `021_finance_snapshots.sql`.
2. **Apply the migration** to the team-os Supabase project (`jtakzjvaxctmnpzsszrf`):
   ```bash
   supabase link --project-ref jtakzjvaxctmnpzsszrf
   supabase db push
   ```
3. On **agents-01**, make sure `DASHBOARD_API_SECRET` is in Hermes' env
   (same value as Vercel) and `TEAM_OS_BASE_URL=https://kalkulai-team-os.vercel.app`.

## forecasting.py output contract (`finance-kpis.json`)

`forecasting.py` must emit one JSON object in this exact shape (EUR amounts as
numbers; `note` optional; `generated_at` is set server-side, omit it):

```json
{
  "as_of": "Finanzplan June-August · 2026-06-01",
  "currency": "EUR",
  "cash_on_hand_eur": 0,
  "runway_months": 0,
  "break_even_label": "M6 · Jan 2027",
  "monthly_burn": { "actual_eur": 0, "plan_eur": 0, "delta_eur": 0 },
  "cost_lines": [
    { "label": "OpenAI/Azure", "amount_eur": 0, "fixed": false, "paid_by": "Company", "note": "optional" }
  ],
  "paid_by": [ { "name": "Company", "value_eur": 0 } ],
  "forecast_6m": [ { "month": "Aug", "cash_eur": 0, "burn_eur": 0 } ],
  "pilot_health": [ { "name": "13 Piloten", "status": "green", "note": "..." } ]
}
```

`status` ∈ `green|yellow|red`. `delta_eur = actual_eur - plan_eur`. `paid_by`
may be `[]` if per-line payers aren't tracked. Use real sheet values — never
placeholders/NaN; omit a value you can't derive and note it.

## Push it

```bash
DASHBOARD_API_SECRET=… TEAM_OS_BASE_URL=https://kalkulai-team-os.vercel.app \
  python3 scripts/cfo-kai/push_finance_snapshot.py --file finance-kpis.json --scenario current
```

Bad payloads are rejected by the endpoint with HTTP 400 + reason.

## Cron (automatic refresh)

Register a Hermes cron that runs forecasting + push on a schedule (e.g. hourly):

```bash
# on agents-01, inside the hermes container
hermes cron create '15 * * * *' --name cfo-finance-push --no-agent \
  --script /vault/_meta/scripts/cfo-finance-push.sh --deliver telegram:6624029259
```

Where `cfo-finance-push.sh` runs forecasting.py then this poster:

```bash
#!/usr/bin/env bash
set -euo pipefail
/opt/data/venv-finance/bin/python /opt/.../forecasting.py --out /tmp/finance-kpis.json
/opt/data/venv-finance/bin/python /opt/.../push_finance_snapshot.py \
  --file /tmp/finance-kpis.json --scenario current
```

## Manual trigger (new plan uploaded)

```bash
sudo docker exec --user hermes kalkulai-hermes /opt/hermes/.venv/bin/hermes cron run <cfo-finance-push-id>
```

## Notes

- The dashboard `GET /api/finance` returns the **latest** snapshot (any scenario)
  by default; pass `?scenario=current|exist` to pin one.
- Until the first snapshot exists, the API serves code defaults from
  `lib/finance-data.ts` (currently the EXIST v11 plan) as a bootstrap.
