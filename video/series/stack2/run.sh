#!/usr/bin/env bash
D=$(cd "$(dirname "$0")" && pwd)
FTV_DEMO_APP="${FTV_DEMO_APP:-$(cd "$D/../../.." && pwd)}"
cd "$FTV_DEMO_APP"
export PORT=3859 DB_PATH="$D/ftv-config/state.db" TZ=Australia/Sydney RECORDINGS_ROOT="$D/recordings" TVH_RECORDINGS_PATH=/recordings MEDIA_ROOT="$D/media/tv" MOVIES_ROOT="$D/media/movies" ONEOFF_ROOT="$D/media/one-offs" ARTWORK_PATH="$D/ftv-config/artwork"
npx knex migrate:latest && exec node src/server.js
