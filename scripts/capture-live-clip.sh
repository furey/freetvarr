#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
CACHE_DIR="${REPO_ROOT}/scripts/.cache"
SOURCE_URL="https://images-assets.nasa.gov/video/jsc2021m000138_4K_Earth_Views_Extended_Cut_for_Earth_Day_%202021_210422-4KMP4/jsc2021m000138_4K_Earth_Views_Extended_Cut_for_Earth_Day_%202021_210422-4KMP4~large.mp4"
CLIP_DIR="${CACHE_DIR}/live-demo"
CLIP_START="${LIVE_CLIP_START:-00:30:50}"
CLIP_SECONDS="${LIVE_CLIP_SECONDS:-30}"
CLIP_STAMP="${CLIP_START}+${CLIP_SECONDS}"

[ "$(cat "${CLIP_DIR}/.stamp" 2>/dev/null)" = "$CLIP_STAMP" ] && exit 0

SEGMENT="${CACHE_DIR}/nasa-earth-views-${CLIP_START//:/}-${CLIP_SECONDS}s.mp4"

mkdir -p "$CACHE_DIR"
if [ ! -f "$SEGMENT" ]; then
  echo "[live-clip] fetching ${CLIP_SECONDS}s from ${CLIP_START} of NASA 4K Earth Views Extended Cut (US government work)"
  ffmpeg -y -loglevel error -ss "$CLIP_START" -i "$SOURCE_URL" -t "$CLIP_SECONDS" -map 0:v:0 -an -c copy "${SEGMENT}.part.mp4"
  mv "${SEGMENT}.part.mp4" "$SEGMENT"
fi

echo "[live-clip] encoding the ${CLIP_SECONDS}s segment to VP9 HLS"
rm -rf "$CLIP_DIR"
mkdir -p "$CLIP_DIR"
ffmpeg -y -loglevel error -i "$SEGMENT" -map 0:v:0 -map_metadata -1 \
  -an -vf "scale=1280:720,setsar=1" -r 30 \
  -c:v libvpx-vp9 -crf 24 -b:v 4000k -maxrate 4000k -bufsize 8000k -deadline good -cpu-used 4 -row-mt 1 \
  -g 60 -keyint_min 60 -pix_fmt yuv420p \
  -f hls -hls_time 2 -hls_playlist_type vod -hls_segment_type fmp4 \
  -hls_fmp4_init_filename init.mp4 -hls_segment_filename "${CLIP_DIR}/seg%d.m4s" \
  "${CLIP_DIR}/index.m3u8"
echo "$CLIP_STAMP" > "${CLIP_DIR}/.stamp"
