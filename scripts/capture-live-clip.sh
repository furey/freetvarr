#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
CACHE_DIR="${REPO_ROOT}/scripts/.cache"
SOURCE_URL="https://download.blender.org/peach/bigbuckbunny_movies/big_buck_bunny_720p_h264.mov.zip"
SOURCE_MOV="${CACHE_DIR}/big_buck_bunny_720p_h264.mov"
CLIP_DIR="${CACHE_DIR}/live-demo"
CLIP_START="${LIVE_CLIP_START:-00:02:15}"
CLIP_SECONDS="${LIVE_CLIP_SECONDS:-30}"
CLIP_STAMP="${CLIP_START}+${CLIP_SECONDS}"

[ "$(cat "${CLIP_DIR}/.stamp" 2>/dev/null)" = "$CLIP_STAMP" ] && exit 0

mkdir -p "$CACHE_DIR"
if [ ! -f "$SOURCE_MOV" ]; then
  echo "[live-clip] downloading Big Buck Bunny (c) Blender Foundation, CC BY 3.0"
  curl -fL --progress-bar -o "${SOURCE_MOV}.zip" "$SOURCE_URL"
  unzip -p "${SOURCE_MOV}.zip" "$(basename "$SOURCE_MOV")" > "${SOURCE_MOV}.part"
  mv "${SOURCE_MOV}.part" "$SOURCE_MOV"
  rm -f "${SOURCE_MOV}.zip"
fi

echo "[live-clip] encoding ${CLIP_SECONDS}s from ${CLIP_START} to VP9 HLS"
rm -rf "$CLIP_DIR"
mkdir -p "$CLIP_DIR"
ffmpeg -y -loglevel error -ss "$CLIP_START" -t "$CLIP_SECONDS" -i "$SOURCE_MOV" -map 0:v:0 -map_metadata -1 \
  -an -vf "scale=1280:720,setsar=1" -r 24 \
  -c:v libvpx-vp9 -crf 24 -b:v 4000k -maxrate 4000k -bufsize 8000k -deadline good -cpu-used 4 -row-mt 1 \
  -g 48 -keyint_min 48 -pix_fmt yuv420p \
  -f hls -hls_time 2 -hls_playlist_type vod -hls_segment_type fmp4 \
  -hls_fmp4_init_filename init.mp4 -hls_segment_filename "${CLIP_DIR}/seg%d.m4s" \
  "${CLIP_DIR}/index.m3u8"
echo "$CLIP_STAMP" > "${CLIP_DIR}/.stamp"
