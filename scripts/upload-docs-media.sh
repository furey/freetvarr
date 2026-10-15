#!/usr/bin/env bash
set -euo pipefail

# Upload the generated docs media listed in scripts/docs-media.txt to the
# `docs-media` GitHub release, replacing assets of the same name, then start a
# docs site deploy so the new media goes live.
#
# Capture scripts call this at the end. Set DOCS_MEDIA_UPLOAD=0 to skip it, and
# DOCS_MEDIA_DEPLOY=0 to upload without starting a deploy.
#
#   ./scripts/upload-docs-media.sh

if [ "${DOCS_MEDIA_UPLOAD:-1}" = "0" ]; then
  echo "[docs-media] upload skipped (DOCS_MEDIA_UPLOAD=0)"
  exit 0
fi

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
MANIFEST="${REPO_ROOT}/scripts/docs-media.txt"
REPOSITORY="${REPOSITORY:-furey/freetvarr}"

files=()
while read -r folder name; do
  [ -n "${folder:-}" ] || continue
  target="${REPO_ROOT}/docs/${folder}/${name}"
  [ -f "$target" ] && files+=("$target")
done < "$MANIFEST"

[ "${#files[@]}" -gt 0 ] || { echo "[docs-media] no files to upload" >&2; exit 1; }

echo "[docs-media] uploading ${#files[@]} files to release docs-media"
gh release upload docs-media "${files[@]}" --clobber --repo "$REPOSITORY"

if [ "${DOCS_MEDIA_DEPLOY:-1}" != "0" ]; then
  gh workflow run docs.yml --ref main --repo "$REPOSITORY"
  echo "[docs-media] docs deploy started"
fi
