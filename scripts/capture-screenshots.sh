#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
FREETVARR_URL="${FREETVARR_URL:-http://localhost:8124}"
FREETVARR_URL="${FREETVARR_URL%/}"
PLAYWRIGHT_IMAGE="${PLAYWRIGHT_IMAGE:-mcr.microsoft.com/playwright:v1.49.0-jammy}"
SHOT_FILTER="${SHOT_FILTER:-${1:-}}"
HOST_UID=$(id -u)
HOST_GID=$(id -g)

if ! command -v docker >/dev/null 2>&1; then
  echo "[capture] docker not found on PATH" >&2
  exit 1
fi

echo "[capture] checking freetvarr at $FREETVARR_URL"
if ! curl -fsS "$FREETVARR_URL/healthz" >/dev/null; then
  echo "[capture] freetvarr is not reachable at $FREETVARR_URL" >&2
  echo "          start it (e.g. docker compose up -d), or set FREETVARR_URL." >&2
  exit 1
fi

echo "[capture] running $PLAYWRIGHT_IMAGE"
docker run --rm --network host \
  -v "$REPO_ROOT":/work \
  -w /tmp \
  -e FREETVARR_URL="$FREETVARR_URL" \
  -e SHOT_FILTER="$SHOT_FILTER" \
  "$PLAYWRIGHT_IMAGE" \
  bash -c "npm init -y >/dev/null && \
    npm install --silent --no-save --no-audit --no-fund playwright@1.49.0 2>&1 | tail -1 && \
    cp /work/scripts/capture-screenshots.mjs ./shot.mjs && \
    node ./shot.mjs && \
    chown -R ${HOST_UID}:${HOST_GID} /work/docs/img/screenshot-*.png"

echo "[capture] done. PNGs:"
ls -lh "$REPO_ROOT/docs/img"/screenshot-*.png
