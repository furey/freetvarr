#!/usr/bin/env bash
set -euo pipefail

# Render the social cards (docs/public/social/*.png and the GitHub preview).
#
# The product cards frame a screenshot of the Home page, taken the same way as
# the docs screenshots: run it against the throwaway server from
# capture-local-server.sh, with the variables that script prints. Home then
# shows the demo pack guide, its artwork, and the seeded library. The fixtures in capture-demo-api.mjs
# answer the rest, and every write is refused in the browser and the loopback.
# The first demo pack hero title picks the hero slide.
#
#   ./scripts/capture-local-server.sh
#   export FREETVARR_URL=http://127.0.0.1:3801 CAPTURE_CLOCK_OFFSET_MS=...
#   ./scripts/capture-social.sh

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
source "$REPO_ROOT/scripts/demo-pack/pack-env.sh"
FREETVARR_URL="${FREETVARR_URL:-http://localhost:3733}"
FREETVARR_URL="${FREETVARR_URL%/}"
HOST_TZ="$TZ"

echo "[social] checking freetvarr at $FREETVARR_URL"
if ! curl -fsS "$FREETVARR_URL/healthz" >/dev/null; then
  echo "[social] freetvarr is not reachable at $FREETVARR_URL" >&2
  echo "         start ./scripts/capture-local-server.sh, or set FREETVARR_URL." >&2
  exit 1
fi

FREETVARR_URL="$FREETVARR_URL" \
TZ="$HOST_TZ" \
SIMULATED_NOW="$SIMULATED_NOW" \
  "$REPO_ROOT/scripts/run-capture-tour.sh" capture-social.mjs

echo "[social] done. PNGs:"
ls -lh "$REPO_ROOT/docs/public/social"/*.png "$REPO_ROOT/docs/img/social-preview.png"
