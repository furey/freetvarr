#!/usr/bin/env bash
set -euo pipefail

# Render the social cards (docs/public/social/*.png and the GitHub preview).
#
# The product cards frame a screenshot of the Home page. It comes from a running
# Freetvarr built from this checkout (FREETVARR_URL); every Home request is
# answered from fixtures in capture-social.mjs, with Mixkit stills as the art,
# so the server's own data never shows. A fresh local server works:
#
#   PORT=3819 DB_PATH=/tmp/social/state.db npm start
#   FREETVARR_URL=http://localhost:3819 ./scripts/capture-social.sh

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
FREETVARR_URL="${FREETVARR_URL:-http://localhost:3733}"
FREETVARR_URL="${FREETVARR_URL%/}"
PLAYWRIGHT_VERSION="${PLAYWRIGHT_VERSION:-1.49.0}"
PLAYWRIGHT_IMAGE="${PLAYWRIGHT_IMAGE:-mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-jammy}"
HOST_UID=$(id -u)
HOST_GID=$(id -g)

command -v docker >/dev/null 2>&1 || { echo "[social] docker not found on PATH" >&2; exit 1; }

echo "[social] checking freetvarr at $FREETVARR_URL"
if ! curl -fsS "$FREETVARR_URL/healthz" >/dev/null; then
  echo "[social] freetvarr is not reachable at $FREETVARR_URL" >&2
  echo "         start one from this checkout, or set FREETVARR_URL." >&2
  exit 1
fi

echo "[social] rendering with $PLAYWRIGHT_IMAGE"
docker run --rm --network host \
  -v "$REPO_ROOT":/work \
  -w /tmp \
  -e FREETVARR_URL="$FREETVARR_URL" \
  "$PLAYWRIGHT_IMAGE" \
  bash -c "npm init -y >/dev/null && \
    npm install --silent --no-save --no-audit --no-fund playwright@${PLAYWRIGHT_VERSION} 2>&1 | tail -1 && \
    cp /work/scripts/capture-social.mjs ./social.mjs && \
    node ./social.mjs && \
    chown -R ${HOST_UID}:${HOST_GID} /work/docs/public/social /work/docs/img /work/scripts/.cache/social-art"

echo "[social] done. PNGs:"
ls -lh "$REPO_ROOT/docs/public/social"/*.png "$REPO_ROOT/docs/img/social-preview.png"
