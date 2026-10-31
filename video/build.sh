#!/usr/bin/env bash
# Rebuilds the Freetvarr overview video from its sources.
#
# Inputs: overview/script.mjs (voiceover lines), stage/ (motion design),
# stage/frames/* (app footage from capture/, see capture/shots.mjs and
# capture/wizard.mjs), the ElevenLabs voice cache in eleven/cache, and the
# music track (Curiosity, Mixkit). assets.sh links the footage and the voice
# cache from $FTV_VIDEO_ASSETS. Uncached lines need ~/.config/elevenlabs.env.
#
#   ./build.sh            render with the cached voice and footage
#   WORKERS=6 ./build.sh  more parallel render workers
set -euo pipefail
Y=$(cd "$(dirname "$0")" && pwd)
. "$Y/assets.sh"
WORKERS="${WORKERS:-4}"
OUT="$Y/freetvarr-overview.mp4"

[ -f ~/.config/elevenlabs.env ] && { set -a; . ~/.config/elevenlabs.env; set +a; }
node "$Y/eleven/build-vo.mjs" "$Y/overview/script.mjs" "$Y/overview/vo.json"
node "$Y/overview/build-timeline.mjs"
node "$Y/overview/build-audio.mjs"
node "$Y/overview/build-youtube-md.mjs" > /dev/null
node "$Y/stage/make-clips.mjs" > /dev/null

if ! curl -fsS -o /dev/null http://127.0.0.1:3895/stage.html; then
  python3 -m http.server 3895 --bind 127.0.0.1 --directory "$Y/stage" > "$Y/stage-server.log" 2>&1 &
  SERVER=$!
  trap 'kill $SERVER' EXIT
  sleep 1
fi

DURATION=$(node -e "console.log(require('$Y/overview/timeline.json').duration)")
rm -rf "$Y/render"
(cd "$Y/stage" && node render.mjs --duration="$DURATION" --workers="$WORKERS" --out="$Y/render")
ffmpeg -y -loglevel error -f concat -safe 0 -i "$Y/render/parts.txt" -i "$Y/overview/voiceover.wav" \
  -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart "$OUT"
cp "$Y/overview/overview.srt" "$Y/freetvarr-overview.srt"
ffprobe -v error -show_entries format=duration,size -of default=nw=1 "$OUT"
