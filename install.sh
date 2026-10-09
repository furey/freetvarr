#!/bin/sh
set -eu

# Install Freetvarr and TVHeadend with Docker Compose.
#
#   curl -fsSL https://raw.githubusercontent.com/furey/freetvarr/main/install.sh | sh
#
# Makes a folder (./freetvarr, or FREETVARR_DIR), downloads the compose file,
# writes a .env with your user and group for you to confirm, then starts both
# services. Re-running it keeps an existing .env and compose file.

FREETVARR_DIR="${FREETVARR_DIR:-$PWD/freetvarr}"
FREETVARR_REF="${FREETVARR_REF:-main}"
COMPOSE_URL="https://raw.githubusercontent.com/furey/freetvarr/${FREETVARR_REF}/docker-compose.example.yml"

use_colour() { [ -t "$1" ] && [ -z "${NO_COLOR:-}" ] && [ "${TERM:-dumb}" != "dumb" ]; }

use_utf8() {
  case "${LC_ALL:-${LC_CTYPE:-${LANG:-}}}" in
    *[Uu][Tt][Ff]-8*|*[Uu][Tt][Ff]8*) return 0 ;;
    *) return 1 ;;
  esac
}

ESC="$(printf '\033')"

paint() { printf '\033[%sm' "$1"; }

setup_colour() {
  RESET="" BOLD="" DIM="" ACCENT="" YELLOW="" GREEN="" LINK=""
  CHIP_BLUE="" CHIP_ORANGE="" CHIP_YELLOW="" PLATE=""
  use_colour 1 || return 0
  orange=33 chip_blue=36 chip_orange=33 chip_yellow=93 plate=40
  case "${TERM:-}:${COLORTERM:-}" in
    *truecolor*|*24bit*)
      orange="38;5;208" chip_blue="38;2;30;182;255" chip_orange="38;2;255;138;0"
      chip_yellow="38;2;226;176;60" plate="48;2;26;22;17" ;;
    *256color*)
      orange="38;5;208" chip_blue="38;5;39" chip_orange="38;5;208"
      chip_yellow="38;5;178" plate="48;5;234" ;;
  esac
  RESET="$(paint 0)" BOLD="$(paint 1)" DIM="$(paint 2)" ACCENT="$(paint "1;$orange")"
  YELLOW="$(paint 93)" GREEN="$(paint 32)" LINK="$(paint "1;4;$orange")"
  CHIP_BLUE="$(paint "$chip_blue")" CHIP_ORANGE="$(paint "$chip_orange")"
  CHIP_YELLOW="$(paint "$chip_yellow")" PLATE="$(paint "$plate")"
}

setup_colour
if use_colour 2; then ERR_RED="$(paint 31)" ERR_RESET="$(paint 0)"; else ERR_RED="" ERR_RESET=""; fi

say() { printf '%s\n' "$*"; }
info() { printf '%s[install]%s %s\n' "$DIM" "$RESET" "$*"; }
ok() { printf '%s[install]%s %s%s%s\n' "$DIM" "$RESET" "$GREEN" "$*" "$RESET"; }
warn() { printf '%s[install]%s %s%s%s\n' "$DIM" "$RESET" "$YELLOW" "$*" "$RESET"; }
fail() { printf '%s[install] %s%s\n' "$ERR_RED" "$*" "$ERR_RESET" >&2; exit 1; }

banner() {
  say ""
  if use_utf8; then
    chips "▄▄▄" "$BOLD" "Freetvarr"
    chips "▀▀▀" "$DIM" "by @furey • https://about.me/jamesfurey"
  else
    printf ' %s###%s %s###%s %s###%s  %sFreetvarr%s\n' \
      "$CHIP_BLUE" "$RESET" "$CHIP_ORANGE" "$RESET" "$CHIP_YELLOW" "$RESET" "$BOLD" "$RESET"
    printf '              %sby @furey - https://about.me/jamesfurey%s\n' "$DIM" "$RESET"
  fi
  say ""
}

chips() {
  printf ' %s  %s%s %s%s %s%s  %s  %s%s%s\n' "$PLATE" "$CHIP_BLUE" "$1" "$CHIP_ORANGE" "$1" \
    "$CHIP_YELLOW" "$1" "$RESET" "$2" "$3" "$RESET"
}

ask_key() {
  (exec < /dev/tty) 2>/dev/null || return 0
  printf '%s%s%s ' "$BOLD" "$1" "$RESET" > /dev/tty
  tty_state="$(stty -g < /dev/tty)"
  trap 'stty "$tty_state" < /dev/tty; printf "\n" > /dev/tty; exit 130' INT TERM
  stty -icanon -echo min 1 time 0 < /dev/tty
  while :; do
    key="$(dd bs=1 count=1 < /dev/tty 2>/dev/null)"
    case "$2" in *"$key"*) break ;; esac
  done
  if [ "$key" = "$ESC" ]; then drain_tty; fi
  stty "$tty_state" < /dev/tty
  trap - INT TERM
  case "$key" in [[:alpha:]]) printf '%s\n' "$key" ;; *) printf '\n' ;; esac > /dev/tty
  printf '%s' "$key"
}

drain_tty() {
  stty min 0 time 1 < /dev/tty
  dd bs=16 count=1 < /dev/tty > /dev/null 2>&1 || true
}

host_zone() {
  if command -v timedatectl >/dev/null 2>&1; then
    timedatectl show -p Timezone --value 2>/dev/null && return
  fi
  readlink /etc/localtime 2>/dev/null | sed -n 's#.*zoneinfo/##p'
}

never_started() {
  [ -z "$(docker compose ps --all --quiet 2>/dev/null)" ]
}

host_address() {
  address=""
  if [ "$(uname -s)" = "Darwin" ]; then
    address="$(ipconfig getifaddr en0 2>/dev/null || true)"
    [ -n "$address" ] || address="$(ipconfig getifaddr en1 2>/dev/null || true)"
    printf '%s' "$address"
    return 0
  fi
  address="$(hostname -I 2>/dev/null | awk '{print $1}')"
  [ -n "$address" ] || address="$(ip route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "src") print $(i + 1)}')"
  printf '%s' "$address"
}

command -v docker >/dev/null 2>&1 || fail "docker not found on the PATH. Install Docker first, or sign in over SSH so a NAS Docker is on the PATH."
docker compose version >/dev/null 2>&1 || fail "docker compose (v2) not found. Install the Docker Compose plugin."
docker info >/dev/null 2>&1 || fail "cannot reach the Docker daemon. Run this as a user in the docker group, or with sudo."

banner
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) fail "Windows is not supported yet. Run Freetvarr on Linux (a NAS, mini PC, or Raspberry Pi) or a Mac." ;;
esac
mkdir -p "$FREETVARR_DIR"
cd "$FREETVARR_DIR"
info "folder: $FREETVARR_DIR"

if [ -f docker-compose.yml ]; then
  info "keeping the existing docker-compose.yml"
else
  curl -fsSL "$COMPOSE_URL" -o docker-compose.yml || fail "could not download $COMPOSE_URL"
  ok "downloaded docker-compose.yml"
fi

if [ -f .env ]; then
  env_line="keeping the existing .env"
else
  zone="$(host_zone || true)"
  {
    say "PUID=${SUDO_UID:-$(id -u)}"
    say "PGID=${SUDO_GID:-$(id -g)}"
    say "# TZ=${zone:-Australia/Sydney}"
  } > .env
  env_line="wrote .env"
fi

if ! never_started; then
  info "$env_line"
else
  ok "$env_line:"
  sed 's/^/    /' .env
  answer="$(ask_key 'Files will be owned by this PUID and PGID. Start now? [Y/n/e = edit .env first]' "yYnNeE$ESC")"
  case "$answer" in
    "$ESC") warn "cancelled. Nothing started. Run this script again when you are ready."; exit 0 ;;
    n|N) warn "stopped. Edit $FREETVARR_DIR/.env, then run this script again."; exit 0 ;;
    e|E) "${EDITOR:-vi}" .env < /dev/tty > /dev/tty ;;
  esac
fi

config_path="$(sed -n 's/^CONFIG_PATH=//p' .env)"
data_path="$(sed -n 's/^DATA_PATH=//p' .env)"
mkdir -p "${config_path:-./config}" "${data_path:-./data}"

docker compose pull
docker compose up -d

port="$(sed -n 's/^FREETVARR_PORT=//p' .env)"
address="$(host_address || true)"
say ""
url="http://${address:-<this-host-ip>}:${port:-3733}"
printf '%s[install]%s %sFreetvarr is starting.%s Open %s%s%s to run the setup wizard.\n' \
  "$DIM" "$RESET" "$GREEN" "$RESET" "$LINK" "$url" "$RESET"
info "To update later: cd $FREETVARR_DIR && docker compose pull && docker compose up -d"
