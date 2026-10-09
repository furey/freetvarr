#!/usr/bin/env bash
set -euo pipefail

# Run a capture tour (scripts/capture-*.mjs) in host Node with Playwright's
# Chromium. The host browser composites on the host GPU, so it paints the 2x
# frames about twice as fast as the software renderer in a Docker container.
#
#   ./scripts/run-capture-tour.sh capture-walkthrough.mjs
#
# PLAYWRIGHT_VERSION (default 1.49.0) picks the Playwright release. Every other
# variable in the environment passes through to the tour.

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
TOUR="$1"
PLAYWRIGHT_VERSION="${PLAYWRIGHT_VERSION:-1.49.0}"
RUN_DIR="${REPO_ROOT}/scripts/.cache/playwright-${PLAYWRIGHT_VERSION}"

command -v node >/dev/null 2>&1 || { echo "[tour] node not found on PATH" >&2; exit 1; }

if [ ! -d "${RUN_DIR}/node_modules/playwright" ]; then
  echo "[tour] installing playwright@${PLAYWRIGHT_VERSION} in ${RUN_DIR#"$REPO_ROOT"/}"
  mkdir -p "$RUN_DIR"
  (cd "$RUN_DIR" && npm init -y >/dev/null && \
    npm install --silent --no-save --no-audit --no-fund "playwright@${PLAYWRIGHT_VERSION}")
fi
(cd "$RUN_DIR" && npx --no-install playwright install chromium >/dev/null)

cp "${REPO_ROOT}"/scripts/capture-*.mjs "$RUN_DIR"/
cd "$RUN_DIR"
exec node "./${TOUR}"
