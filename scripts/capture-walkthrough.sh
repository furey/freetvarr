#!/usr/bin/env bash
set -euo pipefail

# Record a walkthrough of the freetvarr UI and encode it for the docs + README.
#
# A Playwright container drives a scripted cursor tour of the tabs against a
# running freetvarr at a simulated prime time (19:45 tonight in TZ, or set
# SIMULATED_NOW). Guide, search, logo, and programme-image GETs come from the
# real server; settings are masked; syncs, shows, recordings, and recording-now
# are synthetic fixtures; live TV plays a Big Buck Bunny clip (Blender
# Foundation, CC BY 3.0) prepared by capture-live-clip.sh, so no live session
# starts on the server; every non-GET is answered locally and never reaches
# the server. It records a .webm, then ffmpeg on the host trims and transcodes
# it to docs/public/demo.mp4 with a matching poster frame.
#
# Needs host `docker` + `ffmpeg`, and a running freetvarr with a reachable
# TVHeadend EPG (the tour shows its real channels, logos, and artwork).
#
#   ./scripts/capture-walkthrough.sh
#   FREETVARR_URL=http://localhost:3733 ./scripts/capture-walkthrough.sh

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
FREETVARR_URL="${FREETVARR_URL:-http://localhost:3733}"
FREETVARR_URL="${FREETVARR_URL%/}"
PLAYWRIGHT_VERSION="${PLAYWRIGHT_VERSION:-1.49.0}"
PLAYWRIGHT_IMAGE="${PLAYWRIGHT_IMAGE:-mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-jammy}"
HOST_TZ="${TZ:-$(readlink /etc/localtime 2>/dev/null | sed 's#.*zoneinfo/##')}"
HOST_TZ="${HOST_TZ:-Australia/Sydney}"
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

"$REPO_ROOT/scripts/capture-live-clip.sh"

echo "[walkthrough] recording with $PLAYWRIGHT_IMAGE"
docker run --rm --network host \
  -v "$REPO_ROOT":/work \
  -w /tmp \
  -e FREETVARR_URL="$FREETVARR_URL" \
  -e TZ="$HOST_TZ" \
  -e SIMULATED_NOW="${SIMULATED_NOW:-}" \
  -e WALKTHROUGH_OUT="/work" \
  "$PLAYWRIGHT_IMAGE" \
  bash -c "npm init -y >/dev/null && \
    npm install --silent --no-save --no-audit --no-fund playwright@${PLAYWRIGHT_VERSION} 2>&1 | tail -1 && \
    cp /work/scripts/capture-walkthrough.mjs ./tour.mjs && \
    cp /work/scripts/capture-demo-api.mjs ./capture-demo-api.mjs && \
    node ./tour.mjs && \
    chown ${HOST_UID}:${HOST_GID} /work/walkthrough.webm" \
  2>&1 | tee "$DOCKER_LOG"

[ -f "$WEBM" ] || { echo "[walkthrough] no .webm produced" >&2; exit 1; }

TOUR_TRIM=$(sed -n 's/.*TOUR_TRIM=\([0-9][0-9.]*\).*/\1/p' "$DOCKER_LOG" | tail -1)
TRIM_HEAD="${WALKTHROUGH_TRIM_HEAD:-${TOUR_TRIM:-0.5}}"
TOUR_POSTER=$(sed -n 's/.*TOUR_POSTER=\([0-9][0-9.]*\).*/\1/p' "$DOCKER_LOG" | tail -1)
POSTER_AT="${WALKTHROUGH_POSTER_AT:-${TOUR_POSTER:-$TRIM_HEAD}}"
VIDEO_FPS="${WALKTHROUGH_FPS:-25}"

echo "[walkthrough] encoding mp4 (trim head ${TRIM_HEAD}s)"
ffmpeg -y -loglevel error -ss "$TRIM_HEAD" -i "$WEBM" \
  -an -vf "fps=${VIDEO_FPS},scale=trunc(iw/2)*2:trunc(ih/2)*2" -fps_mode cfr \
  -c:v libx264 -profile:v high -crf 23 -preset slow -tune animation \
  -pix_fmt yuv420p -movflags +faststart \
  "$MP4"

echo "[walkthrough] extracting poster at ${POSTER_AT}s"
ffmpeg -y -loglevel error -ss "$POSTER_AT" -i "$WEBM" \
  -frames:v 1 -update 1 -q:v 4 "$POSTER"

rm -f "$WEBM" "$DOCKER_LOG"

echo "[walkthrough] done:"
ls -lh "$MP4" "$POSTER"
