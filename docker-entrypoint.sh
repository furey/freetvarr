#!/bin/sh
set -e

# Run pending migrations against the bind-mounted state DB before starting
# the server. knexfile.js honours DB_PATH, which the image sets to
# /config/state.db.
db_path="${DB_PATH:-/config/state.db}"
config_dir=$(dirname "$db_path")

if [ -f /app/config/state.db ] && [ "$db_path" != /app/config/state.db ]; then
  echo "[entrypoint] found a database at /app/config/state.db, inside the container." >&2
  echo "[entrypoint] Move state.db and the files beside it to the folder mounted at $config_dir, then start Freetvarr again." >&2
  exit 1
fi

unwritable=""
[ -w "$config_dir" ] || unwritable="$config_dir"
for name in "$(basename "$db_path")" "$(basename "$db_path")-wal" "$(basename "$db_path")-shm" csrf-secret; do
  if [ -e "$config_dir/$name" ] && [ ! -w "$config_dir/$name" ]; then
    unwritable="${unwritable:+$unwritable, }$config_dir/$name"
  fi
done

if [ -n "$unwritable" ]; then
  uid=$(id -u)
  gid=$(id -g)
  owner=$(stat -c '%u:%g' "$config_dir" 2>/dev/null || echo unknown)
  echo "[entrypoint] Freetvarr runs as uid $uid (gid $gid) and cannot write to $unwritable." >&2
  echo "[entrypoint] $config_dir is owned by $owner." >&2
  case "$owner" in
    unknown|0:*|"$uid:$gid") ;;
    *) echo "[entrypoint] If TVHeadend runs as $owner, set user: \"$owner\" on the freetvarr service." >&2 ;;
  esac
  echo "[entrypoint] To give the folder to this user, run on the host: sudo chown -R $uid:$gid <the folder mounted at $config_dir>" >&2
  exit 1
fi

echo "[entrypoint] running migrations…"
node node_modules/.bin/knex migrate:latest

echo "[entrypoint] starting freetvarr…"
exec node src/server.js
