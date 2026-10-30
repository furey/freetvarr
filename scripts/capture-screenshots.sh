#!/usr/bin/env bash
set -euo pipefail

# Capture the docs screenshots in host Chromium.
#
# Run it against the throwaway server from capture-local-server.sh, with the
# variables that script prints. Page reads come from that server, the fixtures
# in capture-demo-api.mjs answer the parts that need Plex, Sonarr, Radarr, or a
# live tuner, and every write is answered in the browser. SHOT_FILTER (or the
# first argument) limits the run to shots whose file or address contains it.
#
#   ./scripts/capture-screenshots.sh
#   ./scripts/capture-screenshots.sh screenshot-plex

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
FREETVARR_URL="${FREETVARR_URL:-http://localhost:3733}"
FREETVARR_URL="${FREETVARR_URL%/}"
HOST_TZ="${TZ:-$(readlink /etc/localtime 2>/dev/null | sed 's#.*zoneinfo/##')}"
HOST_TZ="${HOST_TZ:-Australia/Sydney}"

for tool in node ffmpeg; do
  command -v "$tool" >/dev/null 2>&1 || { echo "[capture] $tool not found on PATH" >&2; exit 1; }
done

echo "[capture] checking freetvarr at $FREETVARR_URL"
if ! curl -fsS "$FREETVARR_URL/healthz" >/dev/null; then
  echo "[capture] freetvarr is not reachable at $FREETVARR_URL" >&2
  echo "          start ./scripts/capture-local-server.sh, or set FREETVARR_URL." >&2
  exit 1
fi

"$REPO_ROOT/scripts/capture-live-clip.sh"

FREETVARR_URL="$FREETVARR_URL" \
TZ="$HOST_TZ" \
SIMULATED_NOW="${SIMULATED_NOW:-}" \
SHOT_FILTER="${SHOT_FILTER:-${1:-}}" \
SCREENSHOT_OUT="$REPO_ROOT/docs/img" \
LIVE_DEMO_DIR="$REPO_ROOT/scripts/.cache/live-demo" \
  "$REPO_ROOT/scripts/run-capture-tour.sh" capture-screenshots.mjs

echo "[capture] done. PNGs:"
ls -lh "$REPO_ROOT/docs/img"/screenshot-*.png

"$REPO_ROOT/scripts/upload-docs-media.sh"
