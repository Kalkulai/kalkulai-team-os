#!/usr/bin/env python3
"""Shared helpers for deterministic CFO-Kai deliverable scripts."""
from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_BASE = "https://kalkulai-team-os.vercel.app"
DEFAULT_EXPORT_DIR = Path("Drive Finanzen") / "exports"

REQUIRED_TOP = (
    "as_of",
    "currency",
    "cash_on_hand_eur",
    "runway_months",
    "break_even_label",
    "monthly_burn",
    "cost_lines",
    "paid_by",
    "forecast_6m",
    "pilot_health",
)


def load_finance_data(path: str | Path) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as fh:
        payload = json.load(fh)
    data = payload.get("data") if isinstance(payload, dict) and "data" in payload else payload
    return validate_finance_data(data)


def validate_finance_data(data: Any) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise ValueError("finance JSON must be an object (FinanceData or {data: ...})")
    missing = [k for k in REQUIRED_TOP if k not in data]
    if missing:
        raise ValueError(f"finance data missing required fields: {', '.join(missing)}")
    if data.get("currency") != "EUR":
        raise ValueError("currency must be 'EUR'")
    if not isinstance(data.get("monthly_burn"), dict):
        raise ValueError("monthly_burn must be an object")
    for key in ("actual_eur", "plan_eur", "delta_eur"):
        require_number(data["monthly_burn"], key, "monthly_burn")
    for key in ("cash_on_hand_eur", "runway_months"):
        require_number(data, key, "finance data")
    for key in ("cost_lines", "paid_by", "forecast_6m", "pilot_health"):
        if not isinstance(data.get(key), list):
            raise ValueError(f"{key} must be an array")
    return data


def require_number(obj: dict[str, Any], key: str, where: str) -> None:
    value = obj.get(key)
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        raise ValueError(f"{where}.{key} must be a number")


def fetch_finance_data(base: str, secret: str, scenario: str | None = None) -> dict[str, Any]:
    if not secret:
        raise ValueError("DASHBOARD_API_SECRET is required when --file is not used")
    url = f"{base.rstrip('/')}/api/finance"
    if scenario:
        url = f"{url}?scenario={urllib.request.quote(scenario)}"
    req = urllib.request.Request(
        url=url,
        method="GET",
        headers={"Authorization": f"Bearer {secret}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return validate_finance_data(json.loads(resp.read().decode("utf-8")))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        raise RuntimeError(f"GET /api/finance failed ({exc.code}): {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"cannot reach {base}: {exc.reason}") from exc


def resolve_output_dir(value: str | Path | None = None) -> Path:
    raw = value or os.environ.get("CFO_KAI_EXPORT_DIR")
    path = Path(raw) if raw else DEFAULT_EXPORT_DIR
    path.mkdir(parents=True, exist_ok=True)
    return path


def now_month_label() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def safe_month_label(value: str | None) -> str:
    raw = value or now_month_label()
    if not re.fullmatch(r"\d{4}-\d{2}", raw):
        raise ValueError("--month must use YYYY-MM")
    return raw


def format_eur(value: int | float) -> str:
    return f"{value:,.0f} EUR"


def format_months(value: int | float) -> str:
    return f"{value:.1f} months"


def drive_link_for(path: Path) -> str:
    base = os.environ.get("CFO_KAI_DRIVE_BASE_URL", "").strip()
    if base:
        return f"{base.rstrip('/')}/{urllib.request.pathname2url(path.name)}"
    try:
        return path.resolve().as_uri()
    except ValueError:
        return str(path)


def load_or_fetch(args: Any) -> dict[str, Any]:
    if getattr(args, "file", None):
        return load_finance_data(args.file)
    return fetch_finance_data(args.base, args.secret, getattr(args, "scenario", None))
