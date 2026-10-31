#!/usr/bin/env bash
set -euo pipefail
D=$(cd "$(dirname "$0")" && pwd)
F="${FTV_DEMO_APP:-$(cd "$D/../.." && pwd)}"
if [ "${1:-up}" = up ]; then
  docker stop ftv-video-tvh >/dev/null
  rm -rf "$D/wiz"; mkdir -p "$D/wiz"
  cp -R "$D/snap-base/tvh-config" "$D/snap-base/ftv-config" "$D/wiz/"
  docker run -d --name ftv-video-tvh-wiz -p 127.0.0.1:9981:9981 -p "[::1]:9981:9981" -p 127.0.0.1:9982:9982 -e PUID=501 -e PGID=20 -e TZ=Australia/Sydney -v "$D/wiz/tvh-config:/config" -v "$D/recordings:/recordings" -v "$D/clips:/clips:ro" lscr.io/linuxserver/tvheadend:latest >/dev/null
  (cd "$F" && PORT=3858 DB_PATH="$D/wiz/ftv-config/state.db" TZ=Australia/Sydney RECORDINGS_ROOT="$D/recordings" TVH_RECORDINGS_PATH=/recordings MEDIA_ROOT="$D/media/tv" MOVIES_ROOT="$D/media/movies" ONEOFF_ROOT="$D/media/one-offs" ARTWORK_PATH="$D/wiz/ftv-config/artwork" nohup node src/server.js > "$D/wiz/freetvarr.log" 2>&1 &)
  sleep 12
else
  kill $(lsof -tiTCP:3858 -sTCP:LISTEN) 2>/dev/null || true
  docker rm -f ftv-video-tvh-wiz >/dev/null 2>&1 || true
  docker start ftv-video-tvh >/dev/null
fi
