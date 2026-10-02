#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
FREETVARR_URL="${FREETVARR_URL:-http://localhost:3733}"
FREETVARR_URL="${FREETVARR_URL%/}"
PLAYWRIGHT_IMAGE="${PLAYWRIGHT_IMAGE:-mcr.microsoft.com/playwright:v1.49.0-jammy}"
SHOT_FILTER="${SHOT_FILTER:-${1:-}}"
HOST_TZ="${TZ:-$(readlink /etc/localtime 2>/dev/null | sed 's#.*zoneinfo/##')}"
HOST_TZ="${HOST_TZ:-Australia/Sydney}"
HOST_UID=$(id -u)
HOST_GID=$(id -g)

for tool in docker ffmpeg; do
  command -v "$tool" >/dev/null 2>&1 || { echo "[capture] $tool not found on PATH" >&2; exit 1; }
done

echo "[capture] checking freetvarr at $FREETVARR_URL"
if ! curl -fsS "$FREETVARR_URL/healthz" >/dev/null; then
  echo "[capture] freetvarr is not reachable at $FREETVARR_URL" >&2
  echo "          start it (e.g. docker compose up -d), or set FREETVARR_URL." >&2
  exit 1
fi

"$REPO_ROOT/scripts/capture-live-clip.sh"

echo "[capture] running $PLAYWRIGHT_IMAGE"
docker run --rm --network host \
  -v "$REPO_ROOT":/work \
  -w /tmp \
  -e FREETVARR_URL="$FREETVARR_URL" \
  -e TZ="$HOST_TZ" \
  -e SIMULATED_NOW="${SIMULATED_NOW:-}" \
  -e SHOT_FILTER="$SHOT_FILTER" \
  "$PLAYWRIGHT_IMAGE" \
  bash -c "npm init -y >/dev/null && \
    npm install --silent --no-save --no-audit --no-fund playwright@1.49.0 2>&1 | tail -1 && \
    cp /work/scripts/capture-screenshots.mjs ./shot.mjs && \
    cp /work/scripts/capture-demo-api.mjs ./capture-demo-api.mjs && \
    node ./shot.mjs && \
    chown -R ${HOST_UID}:${HOST_GID} /work/docs/img/screenshot-*.png"

echo "[capture] done. PNGs:"
ls -lh "$REPO_ROOT/docs/img"/screenshot-*.png
