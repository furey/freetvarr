#!/bin/sh
set -e

# Run pending migrations against the bind-mounted state DB before starting
# the server. knexfile.js honours DB_PATH, which the compose file sets to
# /config/state.db.
echo "[entrypoint] running migrations…"
node node_modules/.bin/knex migrate:latest

echo "[entrypoint] starting freetvarr…"
exec node src/server.js
