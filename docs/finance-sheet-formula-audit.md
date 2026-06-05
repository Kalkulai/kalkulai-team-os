# CFO-Kai Finance Sheet Formula Audit

Stand: 2026-06-05. Primäre Audit-Quelle war der lokale Export
`/Users/felixmagiera/Downloads/Kalkulai_EXIST_Finanzplan_v11.xlsx`; zusätzlich wurde
`/Users/felixmagiera/Downloads/Coachingplanung_v11.xlsx` geprüft.

Live-Google-Sheets konnten aus dieser Workspace-Shell nicht gelesen oder verändert werden:
es waren keine `GOOGLE_*`/`GCP_*` Env-Vars gesetzt, die drei Google-Sheet-URLs lieferten
öffentlich `401`, und das Vercel-Projekt war in diesem Workspace nicht verlinkt.

## Ergebnisfelder

| FinanceData-Feld | Kind | Audit-Nachweis |
|---|---:|---|
| `generated_at` | output | App-Snapshot-Zeitpunkt, keine Sheet-Zelle |
| `as_of` | output | aktuell Code-Default in `lib/finance-data.ts`; sollte später Sheet-/Sync-Provenienz werden |
| `currency` | output | statisch `EUR` |
| `cash_on_hand_eur` | output | v11 `AZA Gesamtfinanzierung!C18 = C10+C16` ergibt `54.558`; alternativ Cash-Forecast `GuV Finanzplan!D43 = D42` |
| `runway_months` | output | keine sichtbare v11-Zelle; aktuell App-Rechnung `cash_on_hand / monthly_burn.actual` |
| `break_even_label` | output | v11 `GuV Finanzplan!D52` ist hardcodierter Text |
| `monthly_burn.actual_eur` | output | v11 `GuV Finanzplan!D39 = D20+D23+D24+D25+D26+D29+D30+D33+D34+D35+D36+D37` |
| `monthly_burn.plan_eur` | input | keine separate v11-Zelle sichtbar; als Kai-Hebel mit eigenem Named-Range-Key modelliert |
| `monthly_burn.delta_eur` | output | keine sichtbare v11-Zelle; aktuell App-Rechnung `actual - plan` |
| `cost_lines[].amount_eur` | gemischt | M1-Kosten in `GuV Finanzplan!D23:D37`; Formelzellen sind read-only, direkte Planwerte sind Inputs |
| `paid_by[]` | output | aktuell aus `cost_lines` im Code abgeleitet |
| `forecast_6m[].month` | output | v11 `GuV Finanzplan!D6:I6` |
| `forecast_6m[].cash_eur` | output | v11 `GuV Finanzplan!D43:I43`, kumulierte Formeln |
| `forecast_6m[].burn_eur` | output | v11 `GuV Finanzplan!D39:I39`, Kosten-Total-Formeln |
| `pilot_health[]` | output | aktuell Code-Default, kein direkter Sheet-Contract sichtbar |

## Kai-schreibbare Hebel

Die Map erlaubt nur `kind:'input'`; `app/api/finance/plan/route.ts` lehnt alle Output-
und unbekannten Felder vor einem Write ab.

Plan-/Assumption-Hebel:

- `monthly_burn.plan_eur` -> `cfo_monthly_burn_plan_eur`
- `plan.assumptions.api_cost_per_customer_eur` -> v11 `GuV Finanzplan!C70`
- `plan.assumptions.stripe_fee_rate` -> v11 `GuV Finanzplan!C71`
- `plan.assumptions.pilot_start_count` -> v11 `GuV Finanzplan!C72`
- `plan.assumptions.pilot_new_customers_m2_m5` -> v11 `GuV Finanzplan!C73`
- `plan.assumptions.pilot_conversion_rate_m6` -> v11 `GuV Finanzplan!C74`
- `plan.assumptions.ug_foundation_eur` -> v11 `GuV Finanzplan!C78`

Direkte M1-Cost-Line-Hebel:

- `plan.cost_lines.infrastructure_m1_eur` -> v11 `GuV Finanzplan!D24`
- `plan.cost_lines.development_tools_m1_eur` -> v11 `GuV Finanzplan!D25`
- `plan.cost_lines.monitoring_office_m1_eur` -> v11 `GuV Finanzplan!D26`
- `plan.cost_lines.sales_tools_m1_eur` -> v11 `GuV Finanzplan!D29`
- `plan.cost_lines.marketing_m1_eur` -> v11 `GuV Finanzplan!D30`
- `plan.cost_lines.insurance_m1_eur` -> v11 `GuV Finanzplan!D33`
- `plan.cost_lines.bank_account_m1_eur` -> v11 `GuV Finanzplan!D34`

Nicht direkt als Cost-Line-Zelle schreibbar, weil formelbasiert:

- API M1 `D23 = D10*$C$70`; Hebel ist `C70`
- UG-Gründung `D35 = $C$78`; Hebel ist `C78`
- Legal/Beratung `D36 = ROUND(Coachingplanung!E12/12,0)`; Hebel sind Coaching-Zeilen
- Stripe `D37 = ROUND(D13*$C$71,0)`; Hebel ist `C71`

Coaching-Hebel:

- v11 `Coachingplanung!E4:E11` sind direkte Input-Zellen
- v11 `Coachingplanung!E12 = SUM(E4:E11)` ist Output

## Widersprüche / Live-Schritte

1. `runway_months` und `monthly_burn.delta_eur` brauchen Live-Sheet-Formelzellen, wenn
   "eine Wahrheit = Sheet-Formeln" strikt gelten soll.
2. `break_even_label` ist im Export hardcodiert und nicht formelgetrieben.
3. `monthly_burn.plan_eur` braucht im Live-Sheet eine dedizierte Input-Zelle oder eine
   fachlich bestätigte bestehende Zielzelle.
4. `paid_by` und `pilot_health` sind aktuell nicht Sheet-getrieben.
5. Die in `config/finance-sheet-map.json` genannten Named Ranges müssen live in Google
   Sheets angelegt werden, sobald Service-Account-Zugriff verfügbar ist.
