#!/usr/bin/env bash
# review.sh <slug>: phone-friendly review stills, 1080 wide, two scenes per still
set -euo pipefail
S=$(cd "$(dirname "$0")/.." && pwd); SLUG=$1; D="$S/$SLUG"; R="$D/review"
mkdir -p "$R"; find "$R" -name '*.jpg' -delete
TIMES=( $(node -e "const t=require('$D/timeline.json');console.log(t.scenes.map(s=>(s.start+s.duration*0.6).toFixed(2)).join(' '))") )
i=0; n=1
while [ $i -lt ${#TIMES[@]} ]; do
  a=${TIMES[$i]}; b=${TIMES[$((i+1))]:-}
  ffmpeg -loglevel error -y -ss $a -i "$D/video-$SLUG.mp4" -frames:v 1 -vf scale=1080:-2 "$R/a.png"
  if [ -n "$b" ]; then
    ffmpeg -loglevel error -y -ss $b -i "$D/video-$SLUG.mp4" -frames:v 1 -vf scale=1080:-2 "$R/b.png"
    ffmpeg -loglevel error -y -i "$R/a.png" -i "$R/b.png" -filter_complex "[0:v]pad=1080:620:0:0:color=0x0b1117[x];[x][1:v]vstack=2" -q:v 3 "$R/review-$SLUG-$(printf '%02d' $n).jpg"
  else
    ffmpeg -loglevel error -y -i "$R/a.png" -q:v 3 "$R/review-$SLUG-$(printf '%02d' $n).jpg"
  fi
  i=$((i+2)); n=$((n+1))
done
rm -f "$R/a.png" "$R/b.png"
ls "$R"
