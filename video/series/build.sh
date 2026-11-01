#!/usr/bin/env bash
# Rebuilds one series video: ./build.sh <slug> [--stills=t1,t2,...]
set -euo pipefail
S=$(cd "$(dirname "$0")" && pwd)
. "$S/../assets.sh"
SLUG="$1"
D="$S/$SLUG"
WORKERS="${WORKERS:-6}"
[ -f ~/.config/elevenlabs.env ] && { set -a; . ~/.config/elevenlabs.env; set +a; }
node "$S/tools/build-vo.mjs" "$SLUG"
node "$S/tools/build-timeline.mjs" "$SLUG"
node "$S/stage/make-clips.mjs" > /dev/null
if [ "${2:-}" != "" ]; then
  rm -rf "$D/stills"
  (cd "$S/stage" && node render.mjs --video="$SLUG" "${2}" --out="$D/stills")
  exit 0
fi
node "$S/tools/build-audio.mjs" "$SLUG"
node "$S/tools/build-youtube-md.mjs" "$SLUG" > /dev/null
DURATION=$(node -e "console.log(require('$D/timeline.json').duration)")
rm -rf "$D/render"
(cd "$S/stage" && node render.mjs --video="$SLUG" --duration="$DURATION" --workers="$WORKERS" --out="$D/render")
OUT="$D/video-$SLUG.mp4"
ffmpeg -y -loglevel error -f concat -safe 0 -i "$D/render/parts.txt" -i "$D/voiceover.wav" \
  -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart "$OUT"
ffmpeg -y -loglevel error -i "$OUT" -vf scale=1280:720:flags=lanczos -c:v libx264 -preset slow -crf 27 -pix_fmt yuv420p \
  -c:a aac -b:a 96k -movflags +faststart "$D/$SLUG-preview.mp4"
ffprobe -v error -show_entries format=duration,size -of default=nw=1 "$OUT"
ls -la "$D/$SLUG-preview.mp4"
