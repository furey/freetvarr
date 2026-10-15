#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
CACHE_DIR="${REPO_ROOT}/scripts/.cache"
RAW_DIR="${CACHE_DIR}/mixkit"
CLIP_DIR="${CACHE_DIR}/live-demo"
CUT_SECONDS=5
CUTS="1128:4:1.3:0.6:0.55 1074:6:1.3:0.6:0.55 1127:2:1.2:0.55:0.5 1076:2:1.3:0.6:0.5 1127:9:1.2:0.6:0.5 1076:7:1.3:0.62:0.5"
CLIP_STAMP="mixkit ${CUTS} ${CUT_SECONDS}s 30fps"

[ "$(cat "${CLIP_DIR}/.stamp" 2>/dev/null)" = "$CLIP_STAMP" ] && exit 0

mkdir -p "$RAW_DIR"
CUT_FILES=()
for cut in $CUTS; do
  IFS=: read -r id start zoom centre_x centre_y <<< "$cut"
  raw="${RAW_DIR}/${id}-1080.mp4"
  if [ ! -f "$raw" ]; then
    echo "[live-clip] downloading Mixkit clip ${id} (Mixkit Free License)"
    curl -fL --progress-bar -o "${raw}.part" "https://assets.mixkit.co/videos/${id}/${id}-1080.mp4"
    mv "${raw}.part" "$raw"
  fi
  cut_file="${RAW_DIR}/cut-${id}-${start}s.mp4"
  crop="crop=w=iw/${zoom}:h=ih/${zoom}:x=max(0\,min(iw-iw/${zoom}\,${centre_x}*iw-iw/${zoom}/2)):y=max(0\,min(ih-ih/${zoom}\,${centre_y}*ih-ih/${zoom}/2))"
  ffmpeg -y -loglevel error -ss "$start" -t "$CUT_SECONDS" -i "$raw" -map 0:v:0 -map_metadata -1 -an \
    -vf "${crop},scale=1280:720,setsar=1,fps=30" \
    -c:v libx264 -crf 12 -preset fast -pix_fmt yuv420p "$cut_file"
  CUT_FILES+=("$cut_file")
done

CONCAT_LIST="${RAW_DIR}/concat.txt"
: > "$CONCAT_LIST"
for cut_file in "${CUT_FILES[@]}"; do echo "file '${cut_file}'" >> "$CONCAT_LIST"; done

echo "[live-clip] encoding ${#CUT_FILES[@]} Mixkit cuts of ${CUT_SECONDS}s to VP9 HLS"
rm -rf "$CLIP_DIR"
mkdir -p "$CLIP_DIR"
ffmpeg -y -loglevel error -f concat -safe 0 -i "$CONCAT_LIST" -map 0:v:0 -map_metadata -1 \
  -an -r 30 \
  -c:v libvpx-vp9 -crf 24 -b:v 4000k -maxrate 4000k -bufsize 8000k -deadline good -cpu-used 4 -row-mt 1 \
  -g 60 -keyint_min 60 -pix_fmt yuv420p \
  -f hls -hls_time 2 -hls_playlist_type vod -hls_segment_type fmp4 \
  -hls_fmp4_init_filename init.mp4 -hls_segment_filename "${CLIP_DIR}/seg%d.m4s" \
  "${CLIP_DIR}/index.m3u8"
echo "$CLIP_STAMP" > "${CLIP_DIR}/.stamp"
