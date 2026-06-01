#!/usr/bin/env python3
"""Push a finance snapshot to the Team-OS dashboard.

Final automation step for CFO-Kai (runs on agents-01, Hermes side):

    Google Sheets ──(forecasting.py)──▶ finance-kpis.json
                  ──(THIS script)─────▶ POST /api/finance/snapshot ──▶ Supabase
                                                                   ──▶ GET /api/finance ──▶ Dashboard

It is a thin, dependency-free poster: forecasting.py writes the FinanceData JSON,
this script validates the minimum shape locally and POSTs it. Re-running it after
a sheet edit refreshes the dashboard (idempotent: history kept, reads take latest).

Usage:
    push_finance_snapshot.py --file finance-kpis.json --scenario current

Env (override via flags):
    TEAM_OS_BASE_URL      default https://kalkulai-team-os.vercel.app
    DASHBOARD_API_SECRET  Bearer secret (required)
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request

DEFAULT_BASE = "https://kalkulai-team-os.vercel.app"
REQUIRED_TOP = ("as_of", "currency", "cash_on_hand_eur", "runway_months",
                "break_even_label", "monthly_burn", "cost_lines",
                "paid_by", "forecast_6m", "pilot_health")


def load_finance_data(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as fh:
        payload = json.load(fh)
    # Accept either a bare FinanceData object or {"scenario", "data"}.
    data = payload.get("data") if isinstance(payload, dict) and "data" in payload else payload
    if not isinstance(data, dict):
        raise ValueError("finance JSON must be an object (FinanceData or {data: ...})")
    missing = [k for k in REQUIRED_TOP if k not in data]
    if missing:
        raise ValueError(f"finance data missing required fields: {', '.join(missing)}")
    if data.get("currency") != "EUR":
        raise ValueError("currency must be 'EUR'")
    return data


def post_snapshot(base: str, secret: str, scenario: str, data: dict, source: str) -> dict:
    body = json.dumps({"scenario": scenario, "source": source, "data": data}).encode("utf-8")
    req = urllib.request.Request(
        url=f"{base.rstrip('/')}/api/finance/snapshot",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {secret}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> int:
    ap = argparse.ArgumentParser(description="Push finance snapshot to Team-OS")
    ap.add_argument("--file", required=True, help="Path to finance-kpis.json (FinanceData)")
    ap.add_argument("--scenario", default="current", choices=["exist", "current"])
    ap.add_argument("--base", default=os.environ.get("TEAM_OS_BASE_URL", DEFAULT_BASE))
    ap.add_argument("--secret", default=os.environ.get("DASHBOARD_API_SECRET", ""))
    ap.add_argument("--source", default="cfo-kai:forecasting.py")
    args = ap.parse_args()

    if not args.secret:
        print("ERROR: DASHBOARD_API_SECRET not set (env or --secret)", file=sys.stderr)
        return 2

    try:
        data = load_finance_data(args.file)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"ERROR: bad finance file: {exc}", file=sys.stderr)
        return 2

    try:
        result = post_snapshot(args.base, args.secret, args.scenario, data, args.source)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        print(f"ERROR: POST failed ({exc.code}): {detail}", file=sys.stderr)
        return 1
    except urllib.error.URLError as exc:
        print(f"ERROR: cannot reach {args.base}: {exc.reason}", file=sys.stderr)
        return 1

    print(f"OK: snapshot '{args.scenario}' stored (id={result.get('id')})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
