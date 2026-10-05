#!/usr/bin/env bash
set -euo pipefail

# Record a tour of the first-run setup wizard and encode it for the docs.
#
# A Playwright container walks a fake cursor through every wizard step
# (welcome, TVHeadend with the secure form, channels, guide, storage, Plex,
# ready) against a running freetvarr. Only the page itself (HTML, JS, CSS,
# version, CSRF token) comes from the server. Every API GET the wizard makes
# is answered from a fresh-install simulation built from test/fixtures and the
# real setup modules in src/, so the scan and guide jobs tick through
# realistic Australian data in a few seconds each. Every non-GET is answered
# locally; a write that reaches the server fails the run. It also saves a
# still of the secure-TVHeadend form. ffmpeg on the host trims and transcodes
# the .webm to docs/public/wizard-demo.mp4 with a matching poster frame.
#
# Needs host `docker` + `ffmpeg`, and a running freetvarr (any state: the
# wizard sees a fresh install whatever the server holds).
#
#   ./scripts/capture-wizard.sh
#   FREETVARR_URL=http://localhost:3733 ./scripts/capture-wizard.sh
#   WIZARD_ONLY=still ./scripts/capture-wizard.sh

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
FREETVARR_URL="${FREETVARR_URL:-http://localhost:3733}"
FREETVARR_URL="${FREETVARR_URL%/}"
PLAYWRIGHT_VERSION="${PLAYWRIGHT_VERSION:-1.49.0}"
PLAYWRIGHT_IMAGE="${PLAYWRIGHT_IMAGE:-mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-jammy}"
WIZARD_TZ="${WIZARD_TZ:-Australia/Sydney}"
WIZARD_ONLY="${WIZARD_ONLY:-}"
HOST_UID=$(id -u)
HOST_GID=$(id -g)

WEBM="${REPO_ROOT}/wizard.webm"
MP4="${REPO_ROOT}/docs/public/wizard-demo.mp4"
POSTER="${REPO_ROOT}/docs/public/wizard-demo-poster.jpg"
STILL="${REPO_ROOT}/docs/img/screenshot-wizard-secure.png"
DOCKER_LOG="${REPO_ROOT}/wizard.log"

for tool in docker ffmpeg; do
  command -v "$tool" >/dev/null 2>&1 || { echo "[wizard] $tool not found on PATH" >&2; exit 1; }
done

echo "[wizard] checking freetvarr at $FREETVARR_URL"
if ! curl -fsS "$FREETVARR_URL/healthz" >/dev/null; then
  echo "[wizard] freetvarr is not reachable at $FREETVARR_URL" >&2
  echo "         start it (e.g. node src/server.js), or set FREETVARR_URL." >&2
  exit 1
fi

rm -f "$WEBM"
echo "[wizard] recording with $PLAYWRIGHT_IMAGE"
docker run --rm --network host \
  -v "$REPO_ROOT":/work \
  -w /tmp \
  -e FREETVARR_URL="$FREETVARR_URL" \
  -e TZ="$WIZARD_TZ" \
  -e WIZARD_ONLY="$WIZARD_ONLY" \
  -e WIZARD_OUT="/work" \
  "$PLAYWRIGHT_IMAGE" \
  bash -c "npm init -y >/dev/null && \
    npm install --silent --no-save --no-audit --no-fund playwright@${PLAYWRIGHT_VERSION} 2>&1 | tail -1 && \
    cp /work/scripts/capture-wizard.mjs ./tour.mjs && \
    cp /work/scripts/capture-wizard-api.mjs ./capture-wizard-api.mjs && \
    cp /work/scripts/capture-demo-api.mjs ./capture-demo-api.mjs && \
    status=0 && node ./tour.mjs || status=\$? ; \
    chown ${HOST_UID}:${HOST_GID} /work/wizard.webm /work/docs/img/screenshot-wizard-secure.png 2>/dev/null ; \
    exit \$status" \
  2>&1 | tee "$DOCKER_LOG"

if [ "$WIZARD_ONLY" = "still" ]; then
  rm -f "$DOCKER_LOG"
  echo "[wizard] done:"
  ls -lh "$STILL"
  exit 0
fi

[ -f "$WEBM" ] || { echo "[wizard] no .webm produced" >&2; exit 1; }

TOUR_TRIM=$(sed -n 's/.*TOUR_TRIM=\([0-9][0-9.]*\).*/\1/p' "$DOCKER_LOG" | tail -1)
TRIM_HEAD="${WIZARD_TRIM_HEAD:-${TOUR_TRIM:-0.5}}"
TOUR_POSTER=$(sed -n 's/.*TOUR_POSTER=\([0-9][0-9.]*\).*/\1/p' "$DOCKER_LOG" | tail -1)
POSTER_AT="${WIZARD_POSTER_AT:-${TOUR_POSTER:-$TRIM_HEAD}}"
VIDEO_FPS="${WIZARD_FPS:-25}"

echo "[wizard] encoding mp4 (trim head ${TRIM_HEAD}s)"
ffmpeg -y -loglevel error -ss "$TRIM_HEAD" -i "$WEBM" \
  -an -vf "fps=${VIDEO_FPS},scale=trunc(iw/2)*2:trunc(ih/2)*2" -fps_mode cfr \
  -c:v libx264 -profile:v high -crf 23 -preset slow -tune animation \
  -pix_fmt yuv420p -movflags +faststart \
  "$MP4"

echo "[wizard] extracting poster at ${POSTER_AT}s"
ffmpeg -y -loglevel error -ss "$POSTER_AT" -i "$WEBM" \
  -frames:v 1 -update 1 -q:v 4 "$POSTER"

rm -f "$WEBM" "$DOCKER_LOG"

echo "[wizard] done:"
ls -lh "$MP4" "$POSTER"
[ ! -f "$STILL" ] || ls -lh "$STILL"
