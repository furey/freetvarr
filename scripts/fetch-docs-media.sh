#!/usr/bin/env bash
set -euo pipefail

# Download the generated docs media (videos, posters, screenshots, hero) from
# the `docs-media` GitHub release into docs/public and docs/img.
#
# The files are not in git. scripts/docs-media.txt lists each one as
# "<folder> <name>", where folder is `public` or `img` under docs/. Files that
# already exist are skipped unless --force is passed. A 404 fails the run.
#
# Each `img` file is also copied to docs/public/img so the site serves it at a
# stable URL (https://furey.github.io/freetvarr/img/<name>) for the README.
# GitHub's image proxy rejects release asset URLs (served as octet-stream).
#
#   ./scripts/fetch-docs-media.sh
#   ./scripts/fetch-docs-media.sh --force

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
MANIFEST="${REPO_ROOT}/scripts/docs-media.txt"
REPOSITORY="${REPOSITORY:-furey/freetvarr}"
BASE_URL="https://github.com/${REPOSITORY}/releases/download/docs-media"
FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1

fetched=0
skipped=0
while read -r folder name; do
  [ -n "${folder:-}" ] || continue
  target="${REPO_ROOT}/docs/${folder}/${name}"
  stable="${REPO_ROOT}/docs/public/img/${name}"
  if [ "$FORCE" -eq 0 ] && [ -s "$target" ]; then
    skipped=$((skipped + 1))
    if [ "$folder" = "img" ] && [ ! -s "$stable" ]; then
      mkdir -p "$(dirname "$stable")" && cp "$target" "$stable"
    fi
    continue
  fi
  mkdir -p "$(dirname "$target")"
  echo "[docs-media] fetching ${name}"
  curl -fsSL --retry 3 -o "${target}.part" "${BASE_URL}/${name}" \
    || { rm -f "${target}.part"; echo "[docs-media] failed to download ${BASE_URL}/${name}" >&2; exit 1; }
  mv "${target}.part" "$target"
  if [ "$folder" = "img" ]; then
    mkdir -p "$(dirname "$stable")" && cp "$target" "$stable"
  fi
  fetched=$((fetched + 1))
done < "$MANIFEST"

echo "[docs-media] done: ${fetched} fetched, ${skipped} already present"
