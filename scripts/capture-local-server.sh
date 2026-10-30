#!/usr/bin/env bash
set -euo pipefail

# Start a throwaway local freetvarr for the docs media captures.
#
# The server runs this checkout with a fresh config folder, a clock moved to
# the simulated prime time (19:45 tonight, or SIMULATED_NOW), and syncs that
# never run. It reads TVHeadend through capture-tvh-proxy.mjs, which forwards
# only grid, list, load, status, and imagecache reads, so the guide, series
# rules, and scheduled recordings are real while no write reaches TVHeadend.
# capture-seed.mjs then fills the library from the guide: shows, films,
# one-offs, watch states, ad breaks, sync history, and Plex-only items with
# empty sparse files, so every screen has realistic content.
#
# Prints the URL and the clock offset to pass to the capture scripts. Stop it
# with Ctrl-C.
#
#   TVH_UPSTREAM=http://192.168.1.50:9981 TVH_USERNAME=freetvarr TVH_PASSWORD=... \
#     ./scripts/capture-local-server.sh
#
# TVH_CREDENTIALS_FILE can name a file with `username:<name>` and
# `password:<secret>` lines instead of the two variables.

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
CAPTURE_DIR="${CAPTURE_DIR:-${REPO_ROOT}/scripts/.cache/capture-server}"
PORT="${CAPTURE_PORT:-3801}"
TVH_PROXY_PORT="${TVH_PROXY_PORT:-9982}"
TZ="${TZ:-Australia/Sydney}"
export TZ

[ -n "${TVH_UPSTREAM:-}" ] || { echo "[capture-server] set TVH_UPSTREAM to the TVHeadend address" >&2; exit 1; }
if [ -n "${TVH_CREDENTIALS_FILE:-}" ]; then
  TVH_USERNAME=$(sed -n 's/^username:[[:space:]]*//p' "$TVH_CREDENTIALS_FILE" | tr -d '[:space:]')
  TVH_PASSWORD=$(sed -n 's/^password:[[:space:]]*//p' "$TVH_CREDENTIALS_FILE" | tr -d '[:space:]')
fi
[ -n "${TVH_USERNAME:-}" ] && [ -n "${TVH_PASSWORD:-}" ] || { echo "[capture-server] set TVH_USERNAME and TVH_PASSWORD" >&2; exit 1; }
export TVH_USERNAME TVH_PASSWORD TVH_PROXY_PORT

SIM_NOW_MS=$(SIMULATED_NOW="${SIMULATED_NOW:-}" node -e '
  const forced = Date.parse(process.env.SIMULATED_NOW || "")
  if (Number.isFinite(forced)) { console.log(forced); process.exit(0) }
  const tonight = new Date()
  tonight.setHours(19, 45, 0, 0)
  if (tonight.getTime() <= Date.now()) tonight.setDate(tonight.getDate() + 1)
  console.log(tonight.getTime())')
CAPTURE_CLOCK_OFFSET_MS=$(( SIM_NOW_MS - $(node -e 'console.log(Date.now())') ))
export CAPTURE_CLOCK_OFFSET_MS

rm -rf "$CAPTURE_DIR"
mkdir -p "$CAPTURE_DIR/config" "$CAPTURE_DIR/data/recordings" "$CAPTURE_DIR/data/media/tv" \
  "$CAPTURE_DIR/data/media/one-offs" "$CAPTURE_DIR/data/media/movies"
export DB_PATH="$CAPTURE_DIR/config/state.db"
export PORT CSRF_SECRET="capture-$(node -e 'console.log(require("crypto").randomBytes(16).toString("hex"))')"
export RECORDINGS_ROOT="$CAPTURE_DIR/data/recordings" TVH_RECORDINGS_PATH=/recordings
export MEDIA_ROOT="$CAPTURE_DIR/data/media/tv" ONEOFF_ROOT="$CAPTURE_DIR/data/media/one-offs" MOVIES_ROOT="$CAPTURE_DIR/data/media/movies"

PIDS=()
cleanup() { [ "${#PIDS[@]}" -gt 0 ] && kill "${PIDS[@]}" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

TVH_UPSTREAM="$TVH_UPSTREAM" TVH_PROXY_PORT="$TVH_PROXY_PORT" node "$REPO_ROOT/scripts/capture-tvh-proxy.mjs" &
PIDS+=($!)

cd "$REPO_ROOT"
npx --no-install knex migrate:latest >/dev/null
node --input-type=module -e '
  import knex from "knex"
  import config from "./knexfile.js"
  const db = knex(config)
  const values = {
    tvh_url: `http://127.0.0.1:${process.env.TVH_PROXY_PORT}`,
    tvh_username: process.env.TVH_USERNAME,
    tvh_password: process.env.TVH_PASSWORD,
    sync_cron: "0 0 31 2 *",
    time_zone: process.env.TZ,
  }
  for (const [key, value] of Object.entries(values)) await db("settings").insert({ key, value }).onConflict("key").merge()
  await db.destroy()'

start_server() {
  node --import "$REPO_ROOT/scripts/capture-clock.mjs" src/server.js > "$CAPTURE_DIR/server.log" 2>&1 &
  SERVER_PID=$!
  PIDS+=("$SERVER_PID")
  for _ in $(seq 1 60); do
    curl -fsS "http://127.0.0.1:${PORT}/healthz" >/dev/null 2>&1 && return 0
    sleep 1
  done
  echo "[capture-server] server did not start; see $CAPTURE_DIR/server.log" >&2
  exit 1
}

start_server
echo "[capture-server] loading the guide"
for _ in $(seq 1 90); do
  curl -fs "http://127.0.0.1:${PORT}/api/epg/guide?day=1" | grep -q '"has_image":true' && break
  sleep 2
done
FREETVARR_URL="http://127.0.0.1:${PORT}" node --import "$REPO_ROOT/scripts/capture-clock.mjs" "$REPO_ROOT/scripts/capture-seed.mjs"
kill "$SERVER_PID"
wait "$SERVER_PID" 2>/dev/null || true
start_server
FREETVARR_URL="http://127.0.0.1:${PORT}" node "$REPO_ROOT/scripts/capture-seed.mjs" --warm

echo "$CAPTURE_CLOCK_OFFSET_MS" > "$CAPTURE_DIR/clock-offset"
cat <<EOF
[capture-server] ready at http://127.0.0.1:${PORT} (log: $CAPTURE_DIR/server.log)
[capture-server] run the captures with:
  export FREETVARR_URL=http://127.0.0.1:${PORT} CAPTURE_CLOCK_OFFSET_MS=${CAPTURE_CLOCK_OFFSET_MS} CAPTURE_PATH_ROOT=${CAPTURE_DIR}/data DOCS_MEDIA_UPLOAD=0
EOF
wait
