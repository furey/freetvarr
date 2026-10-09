#!/usr/bin/env bash
set -eu

INSTALL_DIR="${INSTALL_DIR:-~/freetvarr}"
INSTALL_ADDRESS="${INSTALL_ADDRESS:-192.168.1.50}"
SPINNER=(⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏)
TICK=0.08
GREEN=$'\033[32m'
BLUE=$'\033[34m'
RESET=$'\033[0m'
BOLD=$'\033[1m'
DIM=$'\033[2m'

paint() { printf '\033[%sm' "$1"; }

setup_colour() {
  orange=33 chip_blue=36 chip_orange=33 chip_yellow=93 plate=40
  case "${TERM:-}:${COLORTERM:-}" in
    *truecolor*|*24bit*)
      orange="38;5;208" chip_blue="38;2;30;182;255" chip_orange="38;2;255;138;0"
      chip_yellow="38;2;226;176;60" plate="48;2;26;22;17" ;;
    *256color*)
      orange="38;5;208" chip_blue="38;5;39" chip_orange="38;5;208"
      chip_yellow="38;5;178" plate="48;5;234" ;;
  esac
  LINK="$(paint "1;4;$orange")"
  CHIP_BLUE="$(paint "$chip_blue")" CHIP_ORANGE="$(paint "$chip_orange")"
  CHIP_YELLOW="$(paint "$chip_yellow")" PLATE="$(paint "$plate")"
}

setup_colour

say() { printf '%s\n' "$*"; }
pause() { sleep "$1"; }

info() { printf '%s[install]%s %s\n' "$DIM" "$RESET" "$*"; }
ok() { printf '%s[install]%s %s%s%s\n' "$DIM" "$RESET" "$GREEN" "$*" "$RESET"; }

chips() {
  printf ' %s  %s%s %s%s %s%s  %s  %s%s%s\n' "$PLATE" "$CHIP_BLUE" "$1" "$CHIP_ORANGE" "$1" \
    "$CHIP_YELLOW" "$1" "$RESET" "$2" "$3" "$RESET"
}

banner() {
  say ""
  chips "▄▄▄" "$BOLD" "Freetvarr"
  chips "▀▀▀" "$DIM" "by @furey • https://about.me/jamesfurey"
  say ""
}

ask_key() {
  printf '%s%s%s ' "$BOLD" "$1" "$RESET" > /dev/tty
  read -rs _ < /dev/tty || true
  printf '\n' > /dev/tty
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

banner
info "folder: $INSTALL_DIR"
pause 0.5
ok "downloaded docker-compose.yml"
pause 0.4
ok "wrote .env:"
say "    PUID=1000"
say "    PGID=1000"
say "    # TZ=Australia/Sydney"
ask_key 'Files will be owned by this PUID and PGID. Start now? [Y/n/e = edit .env first]'
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
printf '%s[install]%s %sFreetvarr is starting.%s Open %s%s%s to run the setup wizard.\n' \
  "$DIM" "$RESET" "$GREEN" "$RESET" "$LINK" "http://${INSTALL_ADDRESS}:3733" "$RESET"
info "To update later: cd ${INSTALL_DIR} && docker compose pull && docker compose up -d"
