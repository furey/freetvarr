#!/usr/bin/env bash
set -euo pipefail
dir=$1; out=$2
files=( $(ls "$dir"/*.jpg | sort) )
i=0; n=0
while [ $i -lt ${#files[@]} ]; do
  chunk=( "${files[@]:$i:9}" )
  args=(); for f in "${chunk[@]}"; do args+=(-i "$f"); done
  k=${#chunk[@]}
  filt=""
  for ((j=0; j<k; j++)); do filt+="[$j:v]scale=640:360,drawtext=text='$(basename ${chunk[$j]} .jpg)':x=8:y=8:fontsize=22:fontcolor=yellow:box=1:boxcolor=black[v$j];"; done
  for ((j=k; j<9; j++)); do filt+="color=black:s=640x360:d=1[v$j];"; done
  filt+="$(for ((j=0; j<9; j++)); do printf '[v%d]' $j; done)xstack=inputs=9:layout=0_0|640_0|1280_0|0_360|640_360|1280_360|0_720|640_720|1280_720[o]"
  ffmpeg -loglevel error -y "${args[@]}" -filter_complex "$filt" -map "[o]" -frames:v 1 "${out}-$n.jpg"
  i=$((i+9)); n=$((n+1))
done
ls ${out}-*.jpg
