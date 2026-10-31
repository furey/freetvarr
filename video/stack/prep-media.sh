#!/usr/bin/env bash
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
REPO_CACHE="${FTV_VIDEO_ASSETS:-$HOME/code/repos/furey/freetvarr-video-assets}/mixkit"
HOST="$HERE/host"
mkdir -p "$HOST/img" "$HERE/clips" "$HERE/raw"
for id in $(node -e "import('$HERE/content.mjs').then(m=>console.log(m.imageIds().filter(i=>typeof i==='number').join(' ')))"); do
  [ -s "$HOST/img/$id.jpg" ] || curl -fsSL -o "$HOST/img/$id.jpg" "https://assets.mixkit.co/videos/$id/$id-thumb-720-0.jpg"
done
i=0
for spec in 1128:6 1074:8 1127:3 1076:4; do
  id=${spec%%:*}; t=${spec##*:}; name=$(echo a b c d | cut -d' ' -f$((i+1)))
  [ -s "$HOST/img/surf-$name.jpg" ] || ffmpeg -loglevel error -y -ss "$t" -i "$REPO_CACHE/$id-1080.mp4" -frames:v 1 -vf scale=1280:720 -q:v 3 "$HOST/img/surf-$name.jpg"
  i=$((i+1))
done
clip() {
  local name=$1 src=$2 service=$3
  [ -s "$HERE/clips/$name.ts" ] && return
  ffmpeg -nostdin -loglevel error -y -t 30 -i "$src" -f lavfi -t 30 -i anullsrc=r=48000:cl=stereo \
    -map 0:v:0 -map 1:a:0 -vf "scale=1280:720,setsar=1,fps=25" -c:v libx264 -preset fast -crf 20 -g 50 -pix_fmt yuv420p \
    -c:a aac -b:a 96k -shortest -metadata service_name="$service" -metadata service_provider="Demo" -f mpegts "$HERE/clips/$name.ts"
}
node -e "import('$HERE/content.mjs').then(m=>m.CHANNELS.forEach(c=>console.log(c.id, c.clip, c.name)))" | while read -r cid c cname; do
  if [ "$c" = surf ]; then
    src="$REPO_CACHE/1128-1080.mp4"
  else
    src="$HERE/raw/$c-720.mp4"
    [ -s "$src" ] || curl -fsSL -o "$src" "https://assets.mixkit.co/videos/$c/$c-720.mp4"
  fi
  clip "${cid%%.*}" "$src" "$cname"
done
ls "$HOST/img" "$HERE/clips"
