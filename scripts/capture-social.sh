#!/usr/bin/env bash
set -euo pipefail

# Render the social cards (docs/public/social/*.png and the GitHub preview).
#
# The product cards frame a screenshot of the Home page, taken the same way as
# the docs screenshots: run it against the throwaway server from
# capture-local-server.sh, with the variables that script prints. Home then
# shows the real TV guide and its artwork, read through the read-only
# TVHeadend proxy, and the seeded library. The fixtures in capture-demo-api.mjs
# answer the rest, and every write is refused in the browser and the loopback.
# SOCIAL_HERO_TITLE (default Big Brother) picks the hero slide when the guide
# has it.
#
#   TVH_UPSTREAM=http://192.168.1.50:9981 TVH_CREDENTIALS_FILE=... \
#     ./scripts/capture-local-server.sh
#   export FREETVARR_URL=http://127.0.0.1:3801 CAPTURE_CLOCK_OFFSET_MS=...
#   ./scripts/capture-social.sh

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
FREETVARR_URL="${FREETVARR_URL:-http://localhost:3733}"
FREETVARR_URL="${FREETVARR_URL%/}"
HOST_TZ="${TZ:-$(readlink /etc/localtime 2>/dev/null | sed 's#.*zoneinfo/##')}"
HOST_TZ="${HOST_TZ:-Australia/Sydney}"

echo "[social] checking freetvarr at $FREETVARR_URL"
if ! curl -fsS "$FREETVARR_URL/healthz" >/dev/null; then
  echo "[social] freetvarr is not reachable at $FREETVARR_URL" >&2
  echo "         start ./scripts/capture-local-server.sh, or set FREETVARR_URL." >&2
  exit 1
fi

FREETVARR_URL="$FREETVARR_URL" \
TZ="$HOST_TZ" \
SIMULATED_NOW="${SIMULATED_NOW:-}" \
  "$REPO_ROOT/scripts/run-capture-tour.sh" capture-social.mjs

echo "[social] done. PNGs:"
ls -lh "$REPO_ROOT/docs/public/social"/*.png "$REPO_ROOT/docs/img/social-preview.png"
