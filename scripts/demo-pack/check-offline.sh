#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
CAPTURE_DIR="${CAPTURE_DIR:-${REPO_ROOT}/scripts/.cache/capture-server}"
GUARD_LOG="${CAPTURE_DIR}/offline-check.log"
SHOT_DIR=$(mktemp -d)

[ -s "${CAPTURE_DIR}/clock-offset" ] || { echo "[offline-check] start ./scripts/capture-local-server.sh first" >&2; exit 1; }
rm -f "$GUARD_LOG"

FREETVARR_URL="http://127.0.0.1:${CAPTURE_PORT:-3801}" \
CAPTURE_CLOCK_OFFSET_MS="$(cat "${CAPTURE_DIR}/clock-offset")" \
CAPTURE_PATH_ROOT="${CAPTURE_DIR}/data" \
DOCS_MEDIA_UPLOAD=0 \
NETWORK_GUARD_LOG="$GUARD_LOG" \
NODE_OPTIONS="--import ${REPO_ROOT}/scripts/demo-pack/network-guard.mjs" \
SCREENSHOT_OUT="$SHOT_DIR" \
  "$REPO_ROOT/scripts/capture-screenshots.sh" screenshot-dashboard

if [ -s "$GUARD_LOG" ]; then
  echo "[offline-check] FAILED: the capture tried to reach:" >&2
  cat "$GUARD_LOG" >&2
  exit 1
fi
echo "[offline-check] passed: the capture made no connection outside this machine"
rm -rf "$SHOT_DIR"
