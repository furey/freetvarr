#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
. ../assets.sh
./frames.sh
node build.mjs
