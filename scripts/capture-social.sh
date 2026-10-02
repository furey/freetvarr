#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
PLAYWRIGHT_VERSION="${PLAYWRIGHT_VERSION:-1.49.0}"
PLAYWRIGHT_IMAGE="${PLAYWRIGHT_IMAGE:-mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-jammy}"
HOST_UID=$(id -u)
HOST_GID=$(id -g)

command -v docker >/dev/null 2>&1 || { echo "[social] docker not found on PATH" >&2; exit 1; }

echo "[social] rendering with $PLAYWRIGHT_IMAGE"
docker run --rm \
  -v "$REPO_ROOT":/work \
  -w /tmp \
  "$PLAYWRIGHT_IMAGE" \
  bash -c "npm init -y >/dev/null && \
    npm install --silent --no-save --no-audit --no-fund playwright@${PLAYWRIGHT_VERSION} 2>&1 | tail -1 && \
    cp /work/scripts/capture-social.mjs ./social.mjs && \
    node ./social.mjs && \
    chown -R ${HOST_UID}:${HOST_GID} /work/docs/public/social"

echo "[social] done. PNGs:"
ls -lh "$REPO_ROOT/docs/public/social"/*.png
