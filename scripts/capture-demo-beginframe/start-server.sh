#!/usr/bin/env bash
set -euo pipefail

# Start the throwaway capture server (../capture-local-server.sh) with the
# curated library for the homepage demo: only the shows and films below, and
# only those whose poster and backdrop both load. Takes the same TVHeadend
# variables as capture-local-server.sh. Leave it running, then run capture.sh.
#
#   TVH_UPSTREAM=http://192.168.1.50:9981 TVH_CREDENTIALS_FILE=tvh-credentials.txt \
#     ./scripts/capture-demo-beginframe/start-server.sh

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

export DEMO_SHOWS="${DEMO_SHOWS:-Big Brother|Home and Away|Love Island Australia|Hard Quiz|Spicks and Specks|Mastermind Australia|Midsomer Murders|Beyond Paradise|NCIS|The Big Bang Theory|Young Sheldon|Seinfeld|Friends|Taronga: Who's Who In The Zoo|Grand Designs New Zealand|Bluey|The Graham Norton Show|The Celebrity Traitors UK}"
export DEMO_FILMS="${DEMO_FILMS:-Ocean's Eleven|Wonder Woman|The Lost Boys|We Bought A Zoo|The Full Monty|Air Force One|Donnie Darko|O Brother, Where Art Thou?|True Grit}"

exec "$HERE/../capture-local-server.sh"
