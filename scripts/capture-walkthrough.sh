#!/usr/bin/env bash
set -euo pipefail

# Record a walkthrough of the freetvarr UI and encode it for the docs + README.
#
# A Playwright container drives a scripted cursor tour of the tabs against a
# running freetvarr, stubbing every /api GET with synthetic fixtures so the clip
# shows a realistic, populated UI without touching any real data. It records a
# .webm, then ffmpeg on the host trims and transcodes it to docs/public/demo.mp4
# with a matching poster frame.
#
# Needs host `docker` + `ffmpeg`, and a running freetvarr (any DB; the fixtures
# override what's on screen). The app only has to serve the SPA, so an empty
# first-boot instance is fine.
#
#   ./scripts/capture-walkthrough.sh
#   FREETVARR_URL=http://localhost:8124 ./scripts/capture-walkthrough.sh

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
FREETVARR_URL="${FREETVARR_URL:-http://localhost:8124}"
FREETVARR_URL="${FREETVARR_URL%/}"
PLAYWRIGHT_VERSION="${PLAYWRIGHT_VERSION:-1.49.0}"
PLAYWRIGHT_IMAGE="${PLAYWRIGHT_IMAGE:-mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-jammy}"
HOST_UID=$(id -u)
HOST_GID=$(id -g)

WEBM="${REPO_ROOT}/walkthrough.webm"
MP4="${REPO_ROOT}/docs/public/demo.mp4"
POSTER="${REPO_ROOT}/docs/public/demo-poster.jpg"
DOCKER_LOG="${REPO_ROOT}/walkthrough.log"

for tool in docker ffmpeg; do
  command -v "$tool" >/dev/null 2>&1 || { echo "[walkthrough] $tool not found on PATH" >&2; exit 1; }
done

echo "[walkthrough] checking freetvarr at $FREETVARR_URL"
if ! curl -fsS "$FREETVARR_URL/healthz" >/dev/null; then
  echo "[walkthrough] freetvarr is not reachable at $FREETVARR_URL" >&2
  echo "             start it (e.g. docker compose up -d), or set FREETVARR_URL." >&2
  exit 1
fi

echo "[walkthrough] recording with $PLAYWRIGHT_IMAGE"
docker run --rm --network host \
  -v "$REPO_ROOT":/work \
  -w /tmp \
  -e FREETVARR_URL="$FREETVARR_URL" \
  -e WALKTHROUGH_OUT="/work" \
  "$PLAYWRIGHT_IMAGE" \
  bash -c "npm init -y >/dev/null && \
    npm install --silent --no-save --no-audit --no-fund playwright@${PLAYWRIGHT_VERSION} 2>&1 | tail -1 && \
    cp /work/scripts/capture-walkthrough.mjs ./tour.mjs && \
    node ./tour.mjs && \
    chown ${HOST_UID}:${HOST_GID} /work/walkthrough.webm" \
  2>&1 | tee "$DOCKER_LOG"

[ -f "$WEBM" ] || { echo "[walkthrough] no .webm produced" >&2; exit 1; }

TOUR_TRIM=$(sed -n 's/.*TOUR_TRIM=\([0-9][0-9.]*\).*/\1/p' "$DOCKER_LOG" | tail -1)
TRIM_HEAD="${WALKTHROUGH_TRIM_HEAD:-${TOUR_TRIM:-0.5}}"

echo "[walkthrough] encoding mp4 (trim head ${TRIM_HEAD}s)"
ffmpeg -y -loglevel error -ss "$TRIM_HEAD" -i "$WEBM" \
  -an -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" \
  -c:v libx264 -profile:v high -crf 28 -preset slow \
  -pix_fmt yuv420p -movflags +faststart \
  "$MP4"

echo "[walkthrough] extracting poster"
ffmpeg -y -loglevel error -ss "$TRIM_HEAD" -i "$WEBM" \
  -frames:v 1 -update 1 -q:v 4 "$POSTER"

rm -f "$WEBM" "$DOCKER_LOG"

echo "[walkthrough] done:"
ls -lh "$MP4" "$POSTER"
