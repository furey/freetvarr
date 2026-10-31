#!/usr/bin/env bash
set -euo pipefail
S=$(cd "$(dirname "$0")/.." && pwd); SLUG=$1
T=$(node -e "const t=require('$S/$SLUG/timeline.json');const o=[];t.scenes.forEach(s=>{s.cues.forEach(c=>o.push(s.start+c.start+c.duration*0.75));o.push(s.start+s.duration-0.6)});console.log(o.map(x=>x.toFixed(1)).join(','))")
"$S/build.sh" "$SLUG" "--stills=$T" > /dev/null
find "$S/$SLUG" -maxdepth 1 -name 'sheet-*.jpg' -delete
"$S/tools/sheet.sh" "$S/$SLUG/stills" "$S/$SLUG/sheet"
