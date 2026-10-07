#!/usr/bin/env bash
set -eu

INSTALL_DIR="${INSTALL_DIR:-~/freetvarr}"
INSTALL_ADDRESS="${INSTALL_ADDRESS:-192.168.1.50}"
SPINNER=(⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏)
TICK=0.08
GREEN=$'\033[32m'
BLUE=$'\033[34m'
RESET=$'\033[0m'

say() { printf '%s\n' "$*"; }
pause() { sleep "$1"; }

ask() {
  printf '%s ' "$1" > /dev/tty
  read -r answer < /dev/tty || answer=""
}

status_mark() {
  local done=$1 tick=$2
  [ "$done" = 1 ] && { printf '%s✔%s' "$GREEN" "$RESET"; return; }
  printf '%s%s%s' "$BLUE" "${SPINNER[$((tick % ${#SPINNER[@]}))]}" "$RESET"
}

draw_rows() {
  local title=$1 kind=$2 width=$3 elapsed=$4 tick=$5
  shift 5
  local total=$(( $# / 4 )) finished=0 row
  local -a lines=()
  while [ $# -gt 0 ]; do
    local name=$1 busy=$2 doneword=$3 seconds=$4
    shift 4
    local done=0 shown=$elapsed word=$busy
    if awk -v e="$elapsed" -v s="$seconds" 'BEGIN { exit !(e >= s) }'; then
      done=1 shown=$seconds word=$doneword finished=$((finished + 1))
    fi
    lines+=("$(printf ' %s %s %-*s %-8s %6.1fs' "$(status_mark "$done" "$tick")" "$kind" "$width" "$name" "$word" "$shown")")
  done
  printf '\033[2K[+] %s %d/%d\n' "$title" "$finished" "$total"
  for row in "${lines[@]}"; do printf '\033[2K%s\n' "$row"; done
  [ "$finished" = "$total" ]
}

animate() {
  local title=$1 kind=$2 width=$3 speed=$4
  shift 4
  local rows=$(( $# / 4 + 1 )) tick=0 elapsed
  while :; do
    elapsed=$(awk -v t="$tick" -v s="$speed" -v d="$TICK" 'BEGIN { printf "%.1f", t * d * s }')
    [ "$tick" -gt 0 ] && printf '\033[%dA' "$rows"
    draw_rows "$title" "$kind" "$width" "$elapsed" "$tick" "$@" && break
    tick=$((tick + 1))
    sleep "$TICK"
  done
}

say "[install] folder: $INSTALL_DIR"
pause 0.5
say "[install] downloaded docker-compose.yml"
pause 0.4
say "[install] wrote .env:"
say "    PUID=1000"
say "    PGID=1000"
say "    # TZ=Australia/Sydney"
ask 'Files will be owned by this PUID and PGID. Start now? [Y/n/e = edit .env first]'
pause 0.3
animate pull Image 36 28 \
  ghcr.io/furey/freetvarr:latest Pulling Pulled 112.5 \
  lscr.io/linuxserver/tvheadend:latest Pulling Pulled 41.8 \
  busybox:stable Pulling Pulled 1.8
animate up Container 16 4 \
  freetvarr-init-1 Running Exited 9.8 \
  tvheadend Starting Started 3.2 \
  freetvarr Starting Started 2.8
say ""
pause 0.4
say "[install] Freetvarr is starting. Open http://${INSTALL_ADDRESS}:3733 to run the setup wizard."
say "[install] To update later: cd ${INSTALL_DIR} && docker compose pull && docker compose up -d"
