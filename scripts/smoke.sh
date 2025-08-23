#!/usr/bin/env bash
set -euo pipefail
BASE_URL=${BASE_URL:-http://localhost:${PORT:-3001}}

curl -fsS "$BASE_URL/health" | jq . >/dev/null || { echo "Health check failed" >&2; exit 1; }
echo "[smoke] Health OK"

curl -fsS "$BASE_URL/api/state" | jq . >/dev/null || { echo "Get state failed" >&2; exit 1; }
echo "[smoke] Get state OK"
