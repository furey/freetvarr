#!/usr/bin/env bash
set -euo pipefail
Y=$(cd "$(dirname "$0")/.." && pwd)
for name in "$@"; do
  src="$Y/capture/raw/$name"
  dst="$Y/stage/frames/$name"
  rm -rf "$dst"; mkdir -p "$dst"
  scale="scale=1600:1000:flags=lanczos"; [ "$name" = phone ] && scale="scale=744:-2:flags=lanczos"
  (cd "$src" && ffmpeg -nostdin -loglevel error -y -f concat -safe 0 -i frames.ffconcat -vf "fps=30,$scale" -q:v 3 "$dst/%05d.jpg")
  cp "$src/marks.json" "$dst/marks.json"
  echo "$name $(ls "$dst" | grep -c jpg) frames"
done
