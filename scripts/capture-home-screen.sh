#!/usr/bin/env bash
set -euo pipefail

# Record the "Save it as an app" step and encode it for the docs.
#
# Run it against the server from capture-local-server.sh. Playwright in host
# Node takes a Home still at iPad landscape size from
# the demo fixtures (capture-demo-api.mjs), then plays an iPad Home Screen:
# a tap on the Freetvarr icon, the icon zooming up to fill the screen, and the
# Dashboard fading in. It records every frame Chrome paints
# (capture-screencast.mjs), then encode-screencast.sh trims and encodes them
# to docs/public/home-screen-demo.mp4 and home-screen-demo-1x.mp4 with a
# matching poster.
#
# HERO_SHOWCASE sets the Home hero slides and their order, as titles joined
# by | (default Big Brother first, then films and big entertainment shows).
# A title missing from the seeded library comes from tonight's guide as a
# For you or Top rated slide; a title missing from both is skipped.
#
# Needs host `node` + `ffmpeg`, and a running freetvarr with a reachable
# TVHeadend EPG.
#
#   ./scripts/capture-home-screen.sh
#   FREETVARR_URL=http://localhost:3733 ./scripts/capture-home-screen.sh

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
FREETVARR_URL="${FREETVARR_URL:-http://localhost:3733}"
FREETVARR_URL="${FREETVARR_URL%/}"
HOST_TZ="${TZ:-$(readlink /etc/localtime 2>/dev/null | sed 's#.*zoneinfo/##')}"
HOST_TZ="${HOST_TZ:-Australia/Sydney}"

FRAMES_DIR="${REPO_ROOT}/scripts/.cache/frames/home-screen"
MP4="${REPO_ROOT}/docs/public/home-screen-demo.mp4"
POSTER="${REPO_ROOT}/docs/public/home-screen-demo-poster.jpg"
TOUR_LOG="${REPO_ROOT}/home-screen.log"

for tool in node ffmpeg; do
  command -v "$tool" >/dev/null 2>&1 || { echo "[home-screen] $tool not found on PATH" >&2; exit 1; }
done

echo "[home-screen] checking freetvarr at $FREETVARR_URL"
if ! curl -fsS "$FREETVARR_URL/healthz" >/dev/null; then
  echo "[home-screen] freetvarr is not reachable at $FREETVARR_URL" >&2
  echo "              start it (e.g. docker compose up -d), or set FREETVARR_URL." >&2
  exit 1
fi

echo "[home-screen] recording in host Chromium"
FREETVARR_URL="$FREETVARR_URL" \
TZ="$HOST_TZ" \
SIMULATED_NOW="${SIMULATED_NOW:-}" \
HOME_SCREEN_FRAMES="$FRAMES_DIR" \
  "$REPO_ROOT/scripts/run-capture-tour.sh" capture-home-screen.mjs \
  2>&1 | tee "$TOUR_LOG"

[ -s "$FRAMES_DIR/frames.ffconcat" ] || { echo "[home-screen] no frames produced" >&2; exit 1; }

TOUR_TRIM=$(sed -n 's/.*TOUR_TRIM=\([0-9][0-9.]*\).*/\1/p' "$TOUR_LOG" | tail -1)
VIDEO_FPS=60 VIDEO_1X_SIZE=1114x918 \
  "$REPO_ROOT/scripts/encode-screencast.sh" "$FRAMES_DIR" "$MP4" "$POSTER" "${TOUR_TRIM:-0.2}"

rm -rf "$FRAMES_DIR" "$TOUR_LOG"

echo "[home-screen] done:"
ls -lh "$MP4" "${MP4%.mp4}-1x.mp4" "$POSTER"

"$REPO_ROOT/scripts/upload-docs-media.sh"
