#!/usr/bin/env bash
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$HERE/raw1080" "$HERE/host/hd"
for f in "$HERE"/host/img/*.jpg; do
  n=$(basename "$f" .jpg)
  case "$n" in
    surf-*) cp "$f" "$HERE/host/hd/$n.jpg"; continue ;;
  esac
  src="$HERE/raw1080/$n-1080.mp4"
  [ -s "$src" ] || curl -fsSL -o "$src" "https://assets.mixkit.co/videos/$n/$n-1080.mp4" || { cp "$f" "$HERE/host/hd/$n.jpg"; continue; }
  ffmpeg -nostdin -loglevel error -y -ss 0.5 -i "$src" -frames:v 1 -vf "scale=1920:-2" -q:v 3 "$HERE/host/hd/$n.jpg"
done
ls "$HERE/host/hd" | wc -l
