#!/usr/bin/env bash
set -euo pipefail

# Record the one-line install in a terminal and encode it for the docs.
#
# A VHS container (charmbracelet/vhs) plays scripts/demo/install.tape: it types
# the real curl command, but curl and sh are shell functions inside the
# container, so nothing downloads and install.sh never runs. The output comes
# from scripts/demo/install-sim.sh, which prints what a fresh install prints,
# with the image pull sped up. Nothing touches Docker on the host, a NAS, or a
# running freetvarr. ffmpeg on the host transcodes the .webm to
# docs/public/install-demo.mp4 with a poster frame of the finished install.
#
# Needs host `docker` + `ffmpeg`.
#
#   ./scripts/capture-install.sh
#   INSTALL_POSTER_AT=8 ./scripts/capture-install.sh

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
VHS_IMAGE="${VHS_IMAGE:-ghcr.io/charmbracelet/vhs:v0.12.1}"
HOST_UID=$(id -u)
HOST_GID=$(id -g)

TAPE="scripts/demo/install.tape"
WEBM="${REPO_ROOT}/install.webm"
MP4="${REPO_ROOT}/docs/public/install-demo.mp4"
POSTER="${REPO_ROOT}/docs/public/install-demo-poster.jpg"

for tool in docker ffmpeg; do
  command -v "$tool" >/dev/null 2>&1 || { echo "[install-demo] $tool not found on PATH" >&2; exit 1; }
done

rm -f "$WEBM"
echo "[install-demo] recording with $VHS_IMAGE"
docker run --rm \
  -v "$REPO_ROOT":/vhs \
  -w /vhs \
  --entrypoint sh \
  "$VHS_IMAGE" \
  -c "status=0 && vhs $TAPE >/dev/null || status=\$? ; chown ${HOST_UID}:${HOST_GID} /vhs/install.webm 2>/dev/null ; exit \$status"

[ -f "$WEBM" ] || { echo "[install-demo] no .webm produced" >&2; exit 1; }

DURATION=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$WEBM")
POSTER_AT="${INSTALL_POSTER_AT:-$(awk -v d="$DURATION" 'BEGIN { printf "%.2f", d - 1 }')}"
VIDEO_FPS="${INSTALL_FPS:-25}"

echo "[install-demo] encoding mp4 (${DURATION}s)"
ffmpeg -y -loglevel error -i "$WEBM" \
  -an -vf "fps=${VIDEO_FPS},scale=trunc(iw/2)*2:trunc(ih/2)*2" -fps_mode cfr \
  -c:v libx264 -profile:v high -crf 23 -preset slow -tune animation \
  -pix_fmt yuv420p -movflags +faststart \
  "$MP4"

echo "[install-demo] extracting poster at ${POSTER_AT}s"
ffmpeg -y -loglevel error -ss "$POSTER_AT" -i "$WEBM" \
  -frames:v 1 -update 1 -q:v 4 "$POSTER"

rm -f "$WEBM"

echo "[install-demo] done:"
ls -lh "$MP4" "$POSTER"
