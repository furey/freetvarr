#!/usr/bin/env bash
set -euo pipefail

# Record the homepage demo (docs/public/demo.mp4, demo-1x.mp4, and
# demo-poster.jpg) frame by frame with HeadlessExperimental.beginFrame, and cut
# its Live TV shot into the README's docs/img/hero.webp.
#
# tour.mjs runs in Docker in chrome-headless-shell with virtual time, so every
# frame is rendered on schedule at 60 fps however slow the machine is. It
# reads the server from start-server.sh, answers everything else with the
# fixtures in ../capture-demo-api.mjs, and writes nothing to the server.
# encode-screencast.sh then encodes the frames on the host, and
# upload-docs-media.sh publishes them (DOCS_MEDIA_UPLOAD=0 skips that).
#
#   ./scripts/capture-demo-beginframe/capture.sh

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
CAPTURE_DIR="${CAPTURE_DIR:-${REPO_ROOT}/scripts/.cache/capture-server}"
PORT="${CAPTURE_PORT:-3801}"
IMAGE="${PLAYWRIGHT_IMAGE:-mcr.microsoft.com/playwright:v1.60.0-jammy}"
CHROME_BIN="${CHROME_BIN:-/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell}"
FRAMES_DIR="${REPO_ROOT}/scripts/.cache/frames/demo-beginframe"
LIVE_DEMO_DIR="${REPO_ROOT}/scripts/.cache/live-demo"
FPS=60

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
echo "[demo] recording in ${IMAGE}"
docker run --rm --init --cpus="${CAPTURE_CPUS:-6}" --add-host=host.docker.internal:host-gateway \
  -v "${REPO_ROOT}/scripts":/repo/scripts:ro \
  -v "${LIVE_DEMO_DIR}":/live:ro \
  -v "${FRAMES_DIR}":/frames \
  -e TZ="${TZ:-Australia/Sydney}" \
  -e FREETVARR_URL="http://host.docker.internal:${PORT}" \
  -e CAPTURE_CLOCK_OFFSET_MS="$(cat "${CAPTURE_DIR}/clock-offset")" \
  -e CAPTURE_PATH_ROOT="${CAPTURE_DIR}/data" \
  -e LIVE_DEMO_DIR=/live \
  -e LIVE_TUNING_MS="${LIVE_TUNING_MS:-1500}" \
  -e CHROME_BIN="$CHROME_BIN" \
  -e FILM_TITLE -e SERIES_TITLE -e SHOW_TITLE \
  -e "HIDDEN_TITLES=${HIDDEN_TITLES:-Manuka Honey Spring Renewal|Pawn Stars|Summer In The Isles Of Scilly|Millionaire Hot Seat|Millionaire Hot Seat Encore|Rugby League World Cup 2026|Jeopardy!|Anthony Bourdain: A Cook's Tour|Bargain Hunt|Bargain Block|Bargain Mansions|Flower & Flour|Go!|Scrapper|Interview With The Vampire|Bring Her Home|1 Euro House|Chefs Ahoy|My Kitchen Rules|Bamay|Tales From Zambia|Deli Boys}" \
  -e "HERO_SHOWCASE=${HERO_SHOWCASE:-Big Brother|Ocean's Eleven|Wonder Woman|Seinfeld|Hard Quiz}" \
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

VIDEO_FPS="$FPS" "$REPO_ROOT/scripts/encode-screencast.sh" "$FRAMES_DIR" \
  "${REPO_ROOT}/docs/public/demo.mp4" "${REPO_ROOT}/docs/public/demo-poster.jpg" 0

HERO="${REPO_ROOT}/docs/img/hero.webp"
ffmpeg -y -loglevel error -ss "${HERO_START:-5.5}" -t "${HERO_SECONDS:-12}" \
  -i "${REPO_ROOT}/docs/public/demo.mp4" -vf "fps=12,scale=800:-1:flags=lanczos" \
  -c:v libwebp_anim -quality 65 -compression_level 6 -loop 0 -an "$HERO"

echo "[demo] done:"
ls -lh "${REPO_ROOT}/docs/public/demo.mp4" "${REPO_ROOT}/docs/public/demo-1x.mp4" \
  "${REPO_ROOT}/docs/public/demo-poster.jpg" "$HERO"

"$REPO_ROOT/scripts/upload-docs-media.sh"
