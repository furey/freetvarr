#!/usr/bin/env bash
set -euo pipefail

# Record the "Record something" step and encode it for the docs.
#
# Runs the record tour of capture-demo-beginframe/capture.sh: Chrome renders
# every frame on demand at 60 fps in Docker, against the capture server from
# capture-demo-beginframe/start-server.sh. The tour opens the TV guide at the
# simulated prime time, records "Big Wave Season" on 7mate with Record, then
# sets Every episode on a later series. The fixture layer in
# capture-demo-api.mjs answers the record requests, so no write reaches the
# server. Output: docs/public/record-demo.mp4, record-demo-1x.mp4, and
# record-demo-poster.jpg.
#
#   ./scripts/capture-record.sh
#   RECORD_SERIES_TITLE="Grand Designs New Zealand" ./scripts/capture-record.sh

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
TOUR=record exec "$REPO_ROOT/scripts/capture-demo-beginframe/capture.sh"
