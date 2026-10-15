#!/usr/bin/env bash
set -euo pipefail

# Record the "Record something" step and encode it for the docs.
#
# Playwright in host Node opens the TV Guide at a simulated prime time (19:45
# tonight in TZ, or set SIMULATED_NOW), records "Big Wave Season" on 7mate
# with RECORD, then sets a series recording on a later programme with SERIES.
# Guide, search, logo, and programme-image GETs come from the real server. The
# RECORD and SERIES requests are answered by the fixture layer in
# capture-demo-api.mjs, which adds the recording and the series to the state
# the guide reads, so the markers appear without a write reaching the server.
# It records every frame Chrome paints (capture-screencast.mjs), then
# encode-screencast.sh trims and encodes them on the host to
# docs/public/record-demo.mp4 and record-demo-1x.mp4 with a matching poster.
#
# Needs host `node` + `ffmpeg`, and a running freetvarr with a reachable
# TVHeadend EPG.
#
#   ./scripts/capture-record.sh
#   FREETVARR_URL=http://localhost:3733 ./scripts/capture-record.sh

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
FREETVARR_URL="${FREETVARR_URL:-http://localhost:3733}"
FREETVARR_URL="${FREETVARR_URL%/}"
HOST_TZ="${TZ:-$(readlink /etc/localtime 2>/dev/null | sed 's#.*zoneinfo/##')}"
HOST_TZ="${HOST_TZ:-Australia/Sydney}"

FRAMES_DIR="${REPO_ROOT}/scripts/.cache/frames/record"
MP4="${REPO_ROOT}/docs/public/record-demo.mp4"
POSTER="${REPO_ROOT}/docs/public/record-demo-poster.jpg"
TOUR_LOG="${REPO_ROOT}/record.log"

for tool in node ffmpeg; do
  command -v "$tool" >/dev/null 2>&1 || { echo "[record] $tool not found on PATH" >&2; exit 1; }
done

echo "[record] checking freetvarr at $FREETVARR_URL"
if ! curl -fsS "$FREETVARR_URL/healthz" >/dev/null; then
  echo "[record] freetvarr is not reachable at $FREETVARR_URL" >&2
  echo "         start it (e.g. docker compose up -d), or set FREETVARR_URL." >&2
  exit 1
fi

echo "[record] recording in host Chromium"
FREETVARR_URL="$FREETVARR_URL" \
TZ="$HOST_TZ" \
SIMULATED_NOW="${SIMULATED_NOW:-}" \
RECORD_FRAMES="$FRAMES_DIR" \
  "$REPO_ROOT/scripts/run-capture-tour.sh" capture-record.mjs \
  2>&1 | tee "$TOUR_LOG"

[ -s "$FRAMES_DIR/frames.ffconcat" ] || { echo "[record] no frames produced" >&2; exit 1; }

TOUR_TRIM=$(sed -n 's/.*TOUR_TRIM=\([0-9][0-9.]*\).*/\1/p' "$TOUR_LOG" | tail -1)
TRIM_HEAD="${RECORD_TRIM_HEAD:-${TOUR_TRIM:-0.5}}"
VIDEO_FPS="${RECORD_FPS:-60}" \
  "$REPO_ROOT/scripts/encode-screencast.sh" "$FRAMES_DIR" "$MP4" "$POSTER" "$TRIM_HEAD"

rm -rf "$FRAMES_DIR" "$TOUR_LOG"

echo "[record] done:"
ls -lh "$MP4" "${MP4%.mp4}-1x.mp4" "$POSTER"

"$REPO_ROOT/scripts/upload-docs-media.sh"
