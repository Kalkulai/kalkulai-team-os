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

## Deliverables on demand

Kai/Hermes should call the repo-versioned scripts below on agents-01. The LLM
only supplies or selects the FinanceData JSON; the scripts build the files.

Default output directory is `Drive Finanzen/exports/`. Override on the Bridge
with `CFO_KAI_EXPORT_DIR=/path/to/Drive Finanzen/exports`. If
`CFO_KAI_DRIVE_BASE_URL` is set, both scripts print a returned `link=...` using
that base URL; otherwise they print a local file URL.

### XLSX finance export

```bash
DASHBOARD_API_SECRET=... TEAM_OS_BASE_URL=https://kalkulai-team-os.vercel.app \
  python3 scripts/cfo-kai/export_finance_xlsx.py \
    --base "$TEAM_OS_BASE_URL" \
    --scenario current
```

The workbook uses `openpyxl`, separates source inputs from formula sheets, and
applies the financial-model color convention:

- blue font: hardcoded FinanceData inputs from `GET /api/finance`
- black font: workbook formulas/calculations
- yellow fill: assumptions/source context that must be reviewed on snapshot changes

By default the script runs the bundled `document-skills:xlsx` `recalc.py`
after saving and fails if formula errors such as `#REF!`, `#DIV/0!`, `#VALUE!`,
`#N/A`, or `#NAME?` are found. Use `--skip-recalc` only for local debugging.

### Monthly/board report

```bash
DASHBOARD_API_SECRET=... TEAM_OS_BASE_URL=https://kalkulai-team-os.vercel.app \
  python3 scripts/cfo-kai/report_monthly.py \
    --base "$TEAM_OS_BASE_URL" \
    --scenario current \
    --format auto
```

`--format auto` emits PDF when `reportlab` is installed on the Bridge and DOCX
otherwise. Force `--format pdf` for the board-report PDF path; force
`--format docx` for a Word fallback. The report includes executive summary,
cash/burn/runway/break-even KPI table, cost lines, forecast, assumptions, and
sources. All numbers are read from the same FinanceData snapshot as the
dashboard, so the report matches `GET /api/finance`.

### Hermes reply contract

Both scripts print one success line:

```text
OK: xlsx=Drive Finanzen/exports/cfo-kai-finance-YYYY-MM.xlsx link=<drive-or-file-url>
OK: report=Drive Finanzen/exports/cfo-kai-board-report-YYYY-MM.pdf link=<drive-or-file-url>
```

Kai should return that `link=` value in chat after the command exits with code
0. Non-zero exit codes include a single `ERROR:` line on stderr.

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
