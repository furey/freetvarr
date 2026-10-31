#!/usr/bin/env bash
# dense.sh <slug>: frames every 0.5 s from the final mp4 as 6x5 contact sheets
set -euo pipefail
S=$(cd "$(dirname "$0")/.." && pwd); SLUG=$1; D="$S/$SLUG"
mkdir -p "$D/dense"; find "$D/dense" -name '*.jpg' -delete
ffmpeg -loglevel error -y -i "$D/video-$SLUG.mp4" -vf "fps=2,scale=320:180,drawtext=text='%{pts\:hms}':x=4:y=4:fontsize=16:fontcolor=yellow:box=1:boxcolor=black,tile=6x5" "$D/dense/d-%03d.jpg"
ls "$D/dense" | wc -l
