#!/usr/bin/env bash
set -euo pipefail

# Record a walkthrough of the freetvarr UI and encode it for the docs + README.
#
# Playwright in host Node drives a scripted cursor tour of the tabs against a
# running freetvarr at a simulated prime time (19:45 tonight in TZ, or set
# SIMULATED_NOW). Guide, search, logo, and programme-image GETs come from the
# real server; settings are masked; syncs, series, recordings, and recording-now
# are synthetic fixtures; live TV plays a Big Buck Bunny clip (Blender
# Foundation, CC BY 3.0) prepared by capture-live-clip.sh, so no live session
# starts on the server; every non-GET is answered locally and never reaches
# the server. It records every frame Chrome paints (capture-screencast.mjs),
# then encode-screencast.sh trims and encodes them on the host to
# docs/public/demo.mp4 with a matching poster frame.
#
# Needs host `node` + `ffmpeg`, and a running freetvarr with a reachable
# TVHeadend EPG (the tour shows its real channels, logos, and artwork).
#
#   ./scripts/capture-walkthrough.sh
#   FREETVARR_URL=http://localhost:3733 ./scripts/capture-walkthrough.sh

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
FREETVARR_URL="${FREETVARR_URL:-http://localhost:3733}"
FREETVARR_URL="${FREETVARR_URL%/}"
HOST_TZ="${TZ:-$(readlink /etc/localtime 2>/dev/null | sed 's#.*zoneinfo/##')}"
HOST_TZ="${HOST_TZ:-Australia/Sydney}"

FRAMES_DIR="${REPO_ROOT}/scripts/.cache/frames/walkthrough"
MP4="${REPO_ROOT}/docs/public/demo.mp4"
POSTER="${REPO_ROOT}/docs/public/demo-poster.jpg"
TOUR_LOG="${REPO_ROOT}/walkthrough.log"

for tool in node ffmpeg; do
  command -v "$tool" >/dev/null 2>&1 || { echo "[walkthrough] $tool not found on PATH" >&2; exit 1; }
done

echo "[walkthrough] checking freetvarr at $FREETVARR_URL"
if ! curl -fsS "$FREETVARR_URL/healthz" >/dev/null; then
  echo "[walkthrough] freetvarr is not reachable at $FREETVARR_URL" >&2
  echo "             start it (e.g. docker compose up -d), or set FREETVARR_URL." >&2
  exit 1
fi

"$REPO_ROOT/scripts/capture-live-clip.sh"

echo "[walkthrough] recording in host Chromium"
FREETVARR_URL="$FREETVARR_URL" \
TZ="$HOST_TZ" \
SIMULATED_NOW="${SIMULATED_NOW:-}" \
WALKTHROUGH_FRAMES="$FRAMES_DIR" \
LIVE_DEMO_DIR="${REPO_ROOT}/scripts/.cache/live-demo" \
  "$REPO_ROOT/scripts/run-capture-tour.sh" capture-walkthrough.mjs \
  2>&1 | tee "$TOUR_LOG"

[ -s "$FRAMES_DIR/frames.ffconcat" ] || { echo "[walkthrough] no frames produced" >&2; exit 1; }

TOUR_TRIM=$(sed -n 's/.*TOUR_TRIM=\([0-9][0-9.]*\).*/\1/p' "$TOUR_LOG" | tail -1)
TRIM_HEAD="${WALKTHROUGH_TRIM_HEAD:-${TOUR_TRIM:-0.5}}"
TOUR_POSTER=$(sed -n 's/.*TOUR_POSTER=\([0-9][0-9.]*\).*/\1/p' "$TOUR_LOG" | tail -1)
POSTER_AT="${WALKTHROUGH_POSTER_AT:-${TOUR_POSTER:-$TRIM_HEAD}}"
VIDEO_FPS="${WALKTHROUGH_FPS:-60}" \
  "$REPO_ROOT/scripts/encode-screencast.sh" "$FRAMES_DIR" "$MP4" "$POSTER" "$TRIM_HEAD" "$POSTER_AT"

rm -rf "$FRAMES_DIR" "$TOUR_LOG"

echo "[walkthrough] done:"
ls -lh "$MP4" "$POSTER"
