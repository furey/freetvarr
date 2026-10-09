#!/usr/bin/env bash
set -euo pipefail

# Encode the timestamped JPEG frames from capture-screencast.mjs into a docs
# .mp4 and a poster frame. Each frame keeps the time Chrome painted it, so the
# video plays at real speed whatever rate Chrome managed to paint at.
#
#   ./scripts/encode-screencast.sh FRAMES_DIR OUT.mp4 POSTER.jpg TRIM_S POSTER_S
#
# VIDEO_FPS (default 60) sets the constant output rate; VIDEO_CRF (default 26)
# sets the x264 quality.

FRAMES_DIR="$1"
MP4="$2"
POSTER="$3"
TRIM_HEAD="$4"
POSTER_AT="$5"
VIDEO_FPS="${VIDEO_FPS:-60}"
VIDEO_CRF="${VIDEO_CRF:-26}"
CONCAT="${FRAMES_DIR}/frames.ffconcat"

[ -s "$CONCAT" ] || { echo "[encode] no frames in $FRAMES_DIR" >&2; exit 1; }

echo "[encode] $(grep -c '^file' "$CONCAT") frames -> ${MP4##*/} at ${VIDEO_FPS} fps (trim head ${TRIM_HEAD}s)"
ffmpeg -y -loglevel error -f concat -safe 0 -i "$CONCAT" -ss "$TRIM_HEAD" \
  -an -vf "fps=${VIDEO_FPS},scale=trunc(iw/2)*2:trunc(ih/2)*2:out_range=tv,format=yuv420p" -fps_mode cfr \
  -c:v libx264 -profile:v high -crf "$VIDEO_CRF" -preset slow -tune animation \
  -color_range tv -movflags +faststart \
  "$MP4"

echo "[encode] poster at ${POSTER_AT}s"
ffmpeg -y -loglevel error -f concat -safe 0 -i "$CONCAT" -ss "$POSTER_AT" \
  -frames:v 1 -update 1 -q:v 4 "$POSTER"
