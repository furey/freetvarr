#!/usr/bin/env bash
set -euo pipefail

# Record a tour of the first-run setup wizard and encode it for the docs.
#
# Playwright in host Node walks a fake cursor through every wizard step
# (welcome, TVHeadend with the secure form, channels, guide, storage, Plex,
# ready) against a running freetvarr. Only the page itself (HTML, JS, CSS,
# version, CSRF token) comes from the server. Every API GET the wizard makes
# is answered from a fresh-install simulation built from test/fixtures and the
# real setup modules in src/, so the scan and guide jobs tick through
# realistic Australian data in a few seconds each. Every non-GET is answered
# locally; a write that reaches the server fails the run. It also saves a
# still of the secure-TVHeadend form. It records every frame Chrome paints
# (capture-screencast.mjs), then encode-screencast.sh trims and encodes them on
# the host to docs/public/wizard-demo.mp4 with a matching poster frame.
#
# Needs host `node` + `ffmpeg`, and a running freetvarr (any state: the
# wizard sees a fresh install whatever the server holds).
#
#   ./scripts/capture-wizard.sh
#   FREETVARR_URL=http://localhost:3733 ./scripts/capture-wizard.sh
#   WIZARD_ONLY=still ./scripts/capture-wizard.sh

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
FREETVARR_URL="${FREETVARR_URL:-http://localhost:3733}"
FREETVARR_URL="${FREETVARR_URL%/}"
WIZARD_TZ="${WIZARD_TZ:-Australia/Sydney}"
WIZARD_ONLY="${WIZARD_ONLY:-}"

FRAMES_DIR="${REPO_ROOT}/scripts/.cache/frames/wizard"
MP4="${REPO_ROOT}/docs/public/wizard-demo.mp4"
POSTER="${REPO_ROOT}/docs/public/wizard-demo-poster.jpg"
STILL="${REPO_ROOT}/docs/img/screenshot-wizard-secure.png"
TOUR_LOG="${REPO_ROOT}/wizard.log"

for tool in node ffmpeg; do
  command -v "$tool" >/dev/null 2>&1 || { echo "[wizard] $tool not found on PATH" >&2; exit 1; }
done

echo "[wizard] checking freetvarr at $FREETVARR_URL"
if ! curl -fsS "$FREETVARR_URL/healthz" >/dev/null; then
  echo "[wizard] freetvarr is not reachable at $FREETVARR_URL" >&2
  echo "         start it (e.g. node src/server.js), or set FREETVARR_URL." >&2
  exit 1
fi

rm -rf "$FRAMES_DIR"
echo "[wizard] recording in host Chromium"
FREETVARR_URL="$FREETVARR_URL" \
TZ="$WIZARD_TZ" \
WIZARD_ONLY="$WIZARD_ONLY" \
WIZARD_FRAMES="$FRAMES_DIR" \
WIZARD_STILL_OUT="${REPO_ROOT}/docs/img" \
WIZARD_SRC="${REPO_ROOT}/src" \
WIZARD_FIXTURES="${REPO_ROOT}/test/fixtures" \
  "$REPO_ROOT/scripts/run-capture-tour.sh" capture-wizard.mjs \
  2>&1 | tee "$TOUR_LOG"

if [ "$WIZARD_ONLY" = "still" ]; then
  rm -f "$TOUR_LOG"
  echo "[wizard] done:"
  ls -lh "$STILL"
  exit 0
fi

[ -s "$FRAMES_DIR/frames.ffconcat" ] || { echo "[wizard] no frames produced" >&2; exit 1; }

TOUR_TRIM=$(sed -n 's/.*TOUR_TRIM=\([0-9][0-9.]*\).*/\1/p' "$TOUR_LOG" | tail -1)
TRIM_HEAD="${WIZARD_TRIM_HEAD:-${TOUR_TRIM:-0.5}}"
TOUR_POSTER=$(sed -n 's/.*TOUR_POSTER=\([0-9][0-9.]*\).*/\1/p' "$TOUR_LOG" | tail -1)
POSTER_AT="${WIZARD_POSTER_AT:-${TOUR_POSTER:-$TRIM_HEAD}}"
VIDEO_FPS="${WIZARD_FPS:-60}" \
  "$REPO_ROOT/scripts/encode-screencast.sh" "$FRAMES_DIR" "$MP4" "$POSTER" "$TRIM_HEAD" "$POSTER_AT"

rm -rf "$FRAMES_DIR" "$TOUR_LOG"

echo "[wizard] done:"
ls -lh "$MP4" "$POSTER"
[ ! -f "$STILL" ] || ls -lh "$STILL"
