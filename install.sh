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

paint() { printf '\033[%sm' "$1"; }

setup_colour() {
  RESET="" BOLD="" DIM="" ACCENT="" BLUE="" YELLOW="" GREEN="" LINK=""
  use_colour 1 || return 0
  orange=33
  case "${TERM:-}:${COLORTERM:-}" in *256color*|*truecolor*|*24bit*) orange="38;5;208" ;; esac
  RESET="$(paint 0)" BOLD="$(paint 1)" DIM="$(paint 2)" ACCENT="$(paint "1;$orange")"
  BLUE="$(paint 36)" YELLOW="$(paint 93)" GREEN="$(paint 32)"
  LINK="$(paint "1;4;$orange")"
}

setup_colour
if use_colour 2; then ERR_RED="$(paint 31)" ERR_RESET="$(paint 0)"; else ERR_RED="" ERR_RESET=""; fi

say() { printf '%s\n' "$*"; }
info() { printf '%s[install]%s %s\n' "$DIM" "$RESET" "$*"; }
ok() { printf '%s[install]%s %s%s%s\n' "$DIM" "$RESET" "$GREEN" "$*" "$RESET"; }
warn() { printf '%s[install]%s %s%s%s\n' "$DIM" "$RESET" "$YELLOW" "$*" "$RESET"; }
fail() { printf '%s[install] %s%s\n' "$ERR_RED" "$*" "$ERR_RESET" >&2; exit 1; }

banner() {
  if use_utf8; then
    printf ' %s▄▄▄%s %s▄▄▄%s %s▄▄▄%s\n' "$BLUE" "$RESET" "$ACCENT" "$RESET" "$YELLOW" "$RESET"
    printf ' %s███%s %s███%s %s███%s  %sFREETVARR%s\n' \
      "$BLUE" "$RESET" "$ACCENT" "$RESET" "$YELLOW" "$RESET" "$BOLD" "$RESET"
    printf ' %s▀▀▀%s %s▀▀▀%s %s▀▀▀%s  %sby James Furey · https://about.me/jamesfurey%s\n' \
      "$BLUE" "$RESET" "$ACCENT" "$RESET" "$YELLOW" "$RESET" "$DIM" "$RESET"
  else
    printf ' %s###%s %s###%s %s###%s  %sFREETVARR%s\n' \
      "$BLUE" "$RESET" "$ACCENT" "$RESET" "$YELLOW" "$RESET" "$BOLD" "$RESET"
    printf '              %sby James Furey - https://about.me/jamesfurey%s\n' "$DIM" "$RESET"
  fi
  say ""
}

ask() {
  if (exec < /dev/tty) 2>/dev/null; then
    printf '%s%s%s ' "$BOLD" "$1" "$RESET" > /dev/tty
    read -r answer < /dev/tty || answer=""
    printf '%s' "$answer"
  fi
}

host_zone() {
  if command -v timedatectl >/dev/null 2>&1; then
    timedatectl show -p Timezone --value 2>/dev/null && return
  fi
  readlink /etc/localtime 2>/dev/null | sed -n 's#.*zoneinfo/##p'
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
  info "keeping the existing .env"
else
  zone="$(host_zone || true)"
  {
    say "PUID=${SUDO_UID:-$(id -u)}"
    say "PGID=${SUDO_GID:-$(id -g)}"
    say "# TZ=${zone:-Australia/Sydney}"
  } > .env
  ok "wrote .env:"
  sed 's/^/    /' .env
  answer="$(ask 'Files will be owned by this PUID and PGID. Start now? [Y/n/e = edit .env first]')"
  case "$answer" in
    n|N) warn "stopped. Edit $FREETVARR_DIR/.env, then run: docker compose up -d"; exit 0 ;;
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
