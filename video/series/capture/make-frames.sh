#!/usr/bin/env bash
set -euo pipefail
S=$(cd "$(dirname "$0")/.." && pwd)
for name in "$@"; do
  src="$S/capture/raw/$name"; dst="$S/stage/frames/$name"
  mkdir -p "$dst"; find "$dst" -name '*.jpg' -delete
  scale="scale=1600:1000:flags=lanczos"; case "$name" in *phone*) scale="scale=744:-2:flags=lanczos";; esac
  (cd "$src" && ffmpeg -nostdin -loglevel error -y -f concat -safe 0 -i frames.ffconcat -vf "fps=30,$scale" -q:v 3 "$dst/%05d.jpg")
  cp "$src/marks.json" "$dst/marks.json"
  echo "$name $(ls "$dst" | grep -c jpg) frames"
done
