#!/usr/bin/env bash
set -euo pipefail

# Record a walkthrough of the freetvarr UI and encode it for the docs + README.
#
# Playwright in host Node drives a scripted cursor tour of Home, Live TV, the
# TV guide, Recordings, For you, and Settings at a simulated prime time. Run it
# against the throwaway server from capture-local-server.sh: page reads come
# from that server and its seeded library, the fixtures in
# capture-demo-api.mjs answer Plex, Sonarr, Radarr, tuner, and activity reads,
# live TV plays a Mixkit surfing montage prepared by capture-live-clip.sh as
# "Big Wave Season" on "7mate", and every write is answered in the browser. It
# records every frame Chrome paints (capture-screencast.mjs), then
# encode-screencast.sh trims and encodes them on the host to
# docs/public/demo.mp4 with a matching poster frame, and cuts the opening
# seconds into the README's docs/img/hero.webp.
#
# Needs host `node` + `ffmpeg`, and the server from capture-local-server.sh.
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
VIDEO_FPS="${WALKTHROUGH_FPS:-60}" \
  "$REPO_ROOT/scripts/encode-screencast.sh" "$FRAMES_DIR" "$MP4" "$POSTER" "$TRIM_HEAD"

rm -rf "$FRAMES_DIR" "$TOUR_LOG"

HERO="${REPO_ROOT}/docs/img/hero.webp"
HERO_SECONDS="${WALKTHROUGH_HERO_SECONDS:-9.2}"
ffmpeg -y -loglevel error -t "$HERO_SECONDS" -i "$MP4" -vf "fps=12,scale=800:-1:flags=lanczos" \
  -c:v libwebp -quality 65 -compression_level 6 -loop 0 -an "$HERO"

echo "[walkthrough] done:"
ls -lh "$MP4" "$POSTER" "$HERO"

"$REPO_ROOT/scripts/upload-docs-media.sh"
