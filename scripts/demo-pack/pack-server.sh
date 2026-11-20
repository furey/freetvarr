#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
PACK_DIR="$REPO_ROOT/scripts/demo-pack"
CAPTURE_DIR="${CAPTURE_DIR:-${REPO_ROOT}/scripts/.cache/capture-server}"
PORT="${CAPTURE_PORT:-3801}"
FAKE_TVH_PORT="${FAKE_TVH_PORT:-9987}"
source "$PACK_DIR/pack-env.sh"

node "$PACK_DIR/fetch-demo-pack.mjs"

SIM_NOW_MS=$(node -e "console.log(Date.parse('$SIMULATED_NOW'))")
CAPTURE_CLOCK_OFFSET_MS=$(( SIM_NOW_MS - $(node -e 'console.log(Date.now())') ))
export CAPTURE_CLOCK_OFFSET_MS

rm -rf "$CAPTURE_DIR"
mkdir -p "$CAPTURE_DIR/config" "$CAPTURE_DIR/data/recordings" "$CAPTURE_DIR/data/media/tv" \
  "$CAPTURE_DIR/data/media/one-offs" "$CAPTURE_DIR/data/media/movies"
export DB_PATH="$CAPTURE_DIR/config/state.db"
export PORT CSRF_SECRET="capture-$(node -e 'console.log(require("crypto").randomBytes(16).toString("hex"))')"
export RECORDINGS_ROOT="$CAPTURE_DIR/data/recordings" TVH_RECORDINGS_PATH=/recordings
export MEDIA_ROOT="$CAPTURE_DIR/data/media/tv" ONEOFF_ROOT="$CAPTURE_DIR/data/media/one-offs" MOVIES_ROOT="$CAPTURE_DIR/data/media/movies"
export NETWORK_GUARD_LOG="$CAPTURE_DIR/blocked-hosts.log"
GUARD=(--import "$PACK_DIR/network-guard.mjs")
CLOCK=(--import "$REPO_ROOT/scripts/capture-clock.mjs")

PIDS=()
cleanup() { [ "${#PIDS[@]}" -gt 0 ] && kill "${PIDS[@]}" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

FAKE_NOW="$SIMULATED_NOW" node "$PACK_DIR/fake-tvh.mjs" "$FAKE_TVH_PORT" > "$CAPTURE_DIR/fake-tvh.log" 2>&1 &
PIDS+=($!)

cd "$REPO_ROOT"
npx --no-install knex migrate:latest >/dev/null
FAKE_TVH_PORT="$FAKE_TVH_PORT" node --input-type=module -e '
  import knex from "knex"
  import config from "./knexfile.js"
  const db = knex(config)
  const values = {
    tvh_url: `http://127.0.0.1:${process.env.FAKE_TVH_PORT}`,
    tvh_username: "demo",
    tvh_password: "demo",
    sync_cron: "0 0 31 2 *",
    time_zone: process.env.TZ,
    show_artwork_lookup: "false",
    credits_lookup_enabled: "false",
    reviews_lookup_enabled: "false",
  }
  for (const [key, value] of Object.entries(values)) await db("settings").insert({ key, value }).onConflict("key").merge()
  await db.destroy()'
node "${GUARD[@]}" "$PACK_DIR/seed-pack-store.mjs"

start_server() {
  node "${GUARD[@]}" "${CLOCK[@]}" src/server.js > "$CAPTURE_DIR/server.log" 2>&1 &
  SERVER_PID=$!
  PIDS+=("$SERVER_PID")
  for _ in $(seq 1 60); do
    curl -fsS "http://127.0.0.1:${PORT}/healthz" >/dev/null 2>&1 && return 0
    sleep 1
  done
  echo "[pack-server] server did not start; see $CAPTURE_DIR/server.log" >&2
  exit 1
}

start_server
echo "[pack-server] loading the guide"
for _ in $(seq 1 90); do
  curl -fs "http://127.0.0.1:${PORT}/api/epg/guide?day=1" | grep -q '"has_image":true' && break
  sleep 2
done
FREETVARR_URL="http://127.0.0.1:${PORT}" node "${GUARD[@]}" "${CLOCK[@]}" "$REPO_ROOT/scripts/capture-seed.mjs"
FREETVARR_URL="http://127.0.0.1:${PORT}" node "${GUARD[@]}" "${CLOCK[@]}" "$PACK_DIR/seed-pack-household.mjs"
kill "$SERVER_PID"
wait "$SERVER_PID" 2>/dev/null || true
start_server
FREETVARR_URL="http://127.0.0.1:${PORT}" node "$REPO_ROOT/scripts/capture-seed.mjs" --warm
FREETVARR_URL="http://127.0.0.1:${PORT}" node "$PACK_DIR/wait-for-you.mjs"

echo "$CAPTURE_CLOCK_OFFSET_MS" > "$CAPTURE_DIR/clock-offset"
cat <<EOF
[pack-server] ready at http://127.0.0.1:${PORT} (log: $CAPTURE_DIR/server.log, blocked hosts: $NETWORK_GUARD_LOG)
[pack-server] run the captures with:
  export FREETVARR_URL=http://127.0.0.1:${PORT} CAPTURE_CLOCK_OFFSET_MS=${CAPTURE_CLOCK_OFFSET_MS} CAPTURE_PATH_ROOT=${CAPTURE_DIR}/data DOCS_MEDIA_UPLOAD=0
EOF
wait
