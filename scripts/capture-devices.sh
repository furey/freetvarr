#!/usr/bin/env bash
set -euo pipefail

# Record the docs home hero: an iPad playing a looping tour of Freetvarr,
# composited over the light and dark site backgrounds.
#
# Run it against the server from capture-local-server.sh, with the variables
# that script prints. capture-devices.mjs records the iPad screen in host
# Chromium (landscape at 1024x768). It first plays the whole tour once so every
# image is loaded, then records the tour again and fails if any art is unloaded
# or a placeholder while recording. Live TV plays the Mixkit surf montage from
# capture-live-clip.sh as "Big Wave Season" on 7mate. ffmpeg layers the screen
# into the iPad bezel and writes docs/public/devices-light.mp4,
# devices-dark.mp4, their -1x.mp4 versions, and a poster for each.
#
# DEVICES_REUSE_SCREEN=1 skips the recording and composites the iPad screen
# already in scripts/.cache/devices/ipad.mp4.
#
# Needs host `node` + `ffmpeg`, and the server from capture-local-server.sh.
#
#   ./scripts/capture-devices.sh

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
FREETVARR_URL="${FREETVARR_URL:-http://localhost:3733}"
FREETVARR_URL="${FREETVARR_URL%/}"
HOST_TZ="${TZ:-$(readlink /etc/localtime 2>/dev/null | sed 's#.*zoneinfo/##')}"
HOST_TZ="${HOST_TZ:-Australia/Sydney}"

for tool in node ffmpeg; do
  command -v "$tool" >/dev/null 2>&1 || { echo "[devices] $tool not found on PATH" >&2; exit 1; }
done

echo "[devices] checking freetvarr at $FREETVARR_URL"
if ! curl -fsS "$FREETVARR_URL/healthz" >/dev/null; then
  echo "[devices] freetvarr is not reachable at $FREETVARR_URL" >&2
  echo "          start ./scripts/capture-local-server.sh, or set FREETVARR_URL." >&2
  exit 1
fi

"$REPO_ROOT/scripts/capture-live-clip.sh"

echo "[devices] recording in host Chromium"
FREETVARR_URL="$FREETVARR_URL" \
TZ="$HOST_TZ" \
SIMULATED_NOW="${SIMULATED_NOW:-}" \
DEVICES_REUSE_SCREEN="${DEVICES_REUSE_SCREEN:-}" \
LIVE_DEMO_DIR="${REPO_ROOT}/scripts/.cache/live-demo" \
LIVE_TUNING_MS="${LIVE_TUNING_MS:-600}" \
DEVICES_WORK_DIR="${REPO_ROOT}/scripts/.cache/devices" \
  "$REPO_ROOT/scripts/run-capture-tour.sh" capture-devices.mjs

"$REPO_ROOT/scripts/upload-docs-media.sh"
