#!/usr/bin/env bash
# check.sh <slug>: frames from the final mp4 at scene starts+1s, each cue midpoint, and scene ends; contact sheets; loudness
set -euo pipefail
S=$(cd "$(dirname "$0")/.." && pwd); SLUG=$1; D="$S/$SLUG"; OUT="$D/check"
rm -rf "$OUT"; mkdir -p "$OUT"
TIMES=$(node -e "const t=require('$D/timeline.json');const o=[];t.scenes.forEach(s=>{o.push(s.start+0.6);s.cues.forEach(c=>o.push(s.start+c.start+c.duration*0.6));o.push(s.start+s.duration-0.35)});console.log(o.map(x=>x.toFixed(2)).join(' '))")
for t in $TIMES; do ffmpeg -loglevel error -y -ss $t -i "$D/video-$SLUG.mp4" -frames:v 1 -q:v 3 "$OUT/f-$(printf '%07.2f' $t).jpg"; done
"$S/tools/sheet.sh" "$OUT" "$D/check-sheet"
ffmpeg -hide_banner -nostats -i "$D/video-$SLUG.mp4" -af ebur128=peak=true -f null - 2>&1 | grep -E "^\s+(I:|Peak:)" | tail -2
