#!/usr/bin/env bash
# KAL-134 — vault_touches sync: agents-01 → team-os dashboard.
#
# Scans the live vault filesystem for files modified in the last LOOKBACK_MIN
# minutes and pushes them in batches to /api/vault/touched. The dashboard's
# daily-recap aggregator reads from `vault_touches` so non-committed
# operations-sprint output (SOPs, drafts, ADRs) shows up in the summary.
#
# Deploy on agents-01:
#   1. Copy this file to /opt/team-os/vault-touches-sync.sh, chmod +x
#   2. Add a 30-min cron:
#        */30 * * * * VAULT_ROOT=/opt/vault \
#          DASHBOARD_API_SECRET=… TEAM_OS_BASE_URL=https://kalkulai-team-os.vercel.app \
#          /opt/team-os/vault-touches-sync.sh >> /var/log/vault-touches.log 2>&1
#   3. Optional companion (option A of KAL-134) — daily snapshot commit:
#        0 23 * * * cd $VAULT_ROOT && git add -A && \
#          git commit -m "chore(vault): auto-snapshot $(date -I)" || true
#
# Idempotent: the endpoint upserts by path, so reruns just refresh mtimes.

set -euo pipefail

: "${VAULT_ROOT:?VAULT_ROOT not set}"
: "${DASHBOARD_API_SECRET:?DASHBOARD_API_SECRET not set}"
BASE="${TEAM_OS_BASE_URL:-https://kalkulai-team-os.vercel.app}"
LOOKBACK_MIN="${VAULT_LOOKBACK_MIN:-60}"
BATCH_SIZE="${VAULT_BATCH_SIZE:-200}"
HOST_LABEL="${VAULT_SOURCE_HOST:-$(hostname)}"

# Exclude folders that are noisy and never user-authored content.
PRUNE_GLOBS=(
  '*/.git/*' '*/node_modules/*' '*/.obsidian/*' '*/.trash/*'
  '*/__pycache__/*' '*/.venv/*' '*/dist/*' '*/build/*'
)

prune_args=()
for g in "${PRUNE_GLOBS[@]}"; do
  prune_args+=( -path "$g" -prune -o )
done

# Collect "path<TAB>mtime<TAB>size" for files modified in the window.
mapfile -t entries < <(
  find "$VAULT_ROOT" "${prune_args[@]}" \
    -type f -mmin "-$LOOKBACK_MIN" \
    -printf '%P\t%TY-%Tm-%TdT%TH:%TM:%TSZ\t%s\n' 2>/dev/null \
    | LC_ALL=C sort -u
)

total=${#entries[@]}
if [[ $total -eq 0 ]]; then
  echo "$(date -Iseconds) vault-touches-sync: 0 files modified within ${LOOKBACK_MIN}min"
  exit 0
fi

post_batch() {
  local payload="$1"
  curl -sS --max-time 15 -X POST "$BASE/api/vault/touched" \
    -H "Authorization: Bearer $DASHBOARD_API_SECRET" \
    -H 'Content-Type: application/json' \
    -d "$payload"
  echo
}

chunk=()
upserted=0
flush() {
  [[ ${#chunk[@]} -eq 0 ]] && return
  local json
  json=$(printf '%s\n' "${chunk[@]}" \
    | jq -Rsc --arg host "$HOST_LABEL" '
        split("\n") | map(select(length>0)) |
        map(split("\t") | {path: .[0], mtime: .[1], size: (.[2]|tonumber)}) |
        {source_host: $host, files: .}')
  post_batch "$json"
  upserted=$((upserted + ${#chunk[@]}))
  chunk=()
}

for line in "${entries[@]}"; do
  chunk+=("$line")
  if [[ ${#chunk[@]} -ge $BATCH_SIZE ]]; then flush; fi
done
flush

echo "$(date -Iseconds) vault-touches-sync: pushed $upserted/$total files (lookback=${LOOKBACK_MIN}min host=$HOST_LABEL)"
