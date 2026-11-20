#!/usr/bin/env bash
set -euo pipefail

# Record the homepage demo (docs/public/demo.mp4, demo-1x.mp4, and
# demo-poster.jpg) frame by frame with HeadlessExperimental.beginFrame. With
# TOUR=hero, record the short README tour instead (Home, Live TV, the TV guide,
# a channel playing) into docs/img/hero.webp, keeping its 60 fps master in
# scripts/.cache/hero/.
#
# tour.mjs runs in Docker in chrome-headless-shell with virtual time, so every
# frame is rendered on schedule at 60 fps however slow the machine is. It
# reads the server from start-server.sh, answers everything else with the
# fixtures in ../capture-demo-api.mjs, and writes nothing to the server.
# With TOUR=record, record the "Record something" step instead: the TV guide,
# Record on Big Wave Season, then Every episode on a later series, into
# docs/public/record-demo.mp4, record-demo-1x.mp4, and record-demo-poster.jpg.
#
# encode-screencast.sh then encodes the frames on the host, and
# upload-docs-media.sh publishes them (DOCS_MEDIA_UPLOAD=0 skips that).
#
#   ./scripts/capture-demo-beginframe/capture.sh
#   TOUR=hero ./scripts/capture-demo-beginframe/capture.sh
#   TOUR=record ./scripts/capture-demo-beginframe/capture.sh

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
CAPTURE_DIR="${CAPTURE_DIR:-${REPO_ROOT}/scripts/.cache/capture-server}"
PORT="${CAPTURE_PORT:-3801}"
IMAGE="${PLAYWRIGHT_IMAGE:-mcr.microsoft.com/playwright:v1.60.0-jammy}"
CHROME_BIN="${CHROME_BIN:-/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell}"
TOUR="${TOUR:-demo}"
FRAMES_DIR="${REPO_ROOT}/scripts/.cache/frames/${TOUR}-beginframe"
DEFAULT_TUNING_MS=1500
[ "$TOUR" = "hero" ] && DEFAULT_TUNING_MS=900
LIVE_DEMO_DIR="${REPO_ROOT}/scripts/.cache/live-demo"
FPS=60
source "${REPO_ROOT}/scripts/demo-pack/pack-env.sh"

for tool in docker ffmpeg curl; do
  command -v "$tool" >/dev/null 2>&1 || { echo "[demo] $tool not found on PATH" >&2; exit 1; }
done
curl -fsS "http://127.0.0.1:${PORT}/healthz" >/dev/null \
  || { echo "[demo] no capture server on port ${PORT}; run start-server.sh first" >&2; exit 1; }
[ -s "${CAPTURE_DIR}/clock-offset" ] || { echo "[demo] ${CAPTURE_DIR}/clock-offset is missing" >&2; exit 1; }

"$REPO_ROOT/scripts/capture-live-clip.sh"
[ -s "${LIVE_DEMO_DIR}/poster.jpg" ] || ffmpeg -y -loglevel error -i "${LIVE_DEMO_DIR}/index.m3u8" \
  -ss 4 -frames:v 1 -vf scale=1280:-2 -q:v 3 "${LIVE_DEMO_DIR}/poster.jpg"

rm -rf "$FRAMES_DIR"
mkdir -p "$FRAMES_DIR"
echo "[demo] recording the ${TOUR} tour in ${IMAGE}"
docker run --rm --init --cpus="${CAPTURE_CPUS:-6}" --add-host=host.docker.internal:host-gateway \
  -v "${REPO_ROOT}/scripts":/repo/scripts:ro \
  -v "${LIVE_DEMO_DIR}":/live:ro \
  -v "${FRAMES_DIR}":/frames \
  -e TZ="$TZ" \
  -e FREETVARR_URL="http://host.docker.internal:${PORT}" \
  -e CAPTURE_CLOCK_OFFSET_MS="$(cat "${CAPTURE_DIR}/clock-offset")" \
  -e CAPTURE_PATH_ROOT="${CAPTURE_DIR}/data" \
  -e LIVE_DEMO_DIR=/live \
  -e LIVE_TUNING_MS="${LIVE_TUNING_MS:-$DEFAULT_TUNING_MS}" \
  -e CHROME_BIN="$CHROME_BIN" \
  -e TOUR="$TOUR" \
  -e FILM_TITLE -e SERIES_TITLE -e SHOW_TITLE -e RECORD_SERIES_TITLE \
  -e HERO_SHOWCASE -e SEARCH_QUERY \
  "$IMAGE" node /repo/scripts/capture-demo-beginframe/tour.mjs /frames

ls "$FRAMES_DIR"/*.jpg >/dev/null 2>&1 || { echo "[demo] no frames produced" >&2; exit 1; }
FRAME_SECONDS=$(awk -v f="$FPS" 'BEGIN { printf "%.6f", 1 / f }')
{
  echo "ffconcat version 1.0"
  for frame in "$FRAMES_DIR"/*.jpg; do
    echo "file '${frame}'"
    echo "duration ${FRAME_SECONDS}"
  done
} > "${FRAMES_DIR}/frames.ffconcat"

if [ "$TOUR" = "hero" ]; then
  HERO_MASTER_DIR="${REPO_ROOT}/scripts/.cache/hero"
  HERO_MASTER="${HERO_MASTER_DIR}/hero.mp4"
  HERO="${REPO_ROOT}/docs/img/hero.webp"
  mkdir -p "$HERO_MASTER_DIR"
  VIDEO_FPS="$FPS" "$REPO_ROOT/scripts/encode-screencast.sh" "$FRAMES_DIR" "$HERO_MASTER" "${HERO_MASTER_DIR}/hero-poster.jpg" 0
  ffmpeg -y -loglevel error -i "$HERO_MASTER" -vf "fps=${HERO_FPS:-12},scale=800:-1:flags=lanczos" \
    -c:v libwebp_anim -quality "${HERO_QUALITY:-45}" -compression_level 6 -loop 0 -an "$HERO"
  echo "[demo] done:"
  ls -lh "$HERO_MASTER" "$HERO"
else
  VIDEO_NAME=$([ "$TOUR" = "record" ] && echo record-demo || echo demo)
  VIDEO_FPS="$FPS" "$REPO_ROOT/scripts/encode-screencast.sh" "$FRAMES_DIR" \
    "${REPO_ROOT}/docs/public/${VIDEO_NAME}.mp4" "${REPO_ROOT}/docs/public/${VIDEO_NAME}-poster.jpg" 0
  echo "[demo] done:"
  ls -lh "${REPO_ROOT}/docs/public/${VIDEO_NAME}.mp4" "${REPO_ROOT}/docs/public/${VIDEO_NAME}-1x.mp4" \
    "${REPO_ROOT}/docs/public/${VIDEO_NAME}-poster.jpg"
fi

"$REPO_ROOT/scripts/upload-docs-media.sh"
