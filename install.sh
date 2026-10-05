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

say() { printf '%s\n' "$*"; }
fail() { say "[install] $*" >&2; exit 1; }

ask() {
  if { : < /dev/tty; } 2>/dev/null; then
    printf '%s ' "$1" > /dev/tty
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
  address="$(hostname -I 2>/dev/null | awk '{print $1}')"
  [ -n "$address" ] || address="$(ip route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "src") print $(i + 1)}')"
  printf '%s' "$address"
}

command -v docker >/dev/null 2>&1 || fail "docker not found on the PATH. Install Docker first (on Synology, sign in over SSH so /usr/local/bin is on the PATH)."
docker compose version >/dev/null 2>&1 || fail "docker compose (v2) not found. Install the Docker Compose plugin."
docker info >/dev/null 2>&1 || fail "cannot reach the Docker daemon. Run this as a user in the docker group, or with sudo."

mkdir -p "$FREETVARR_DIR"
cd "$FREETVARR_DIR"
say "[install] folder: $FREETVARR_DIR"

if [ -f docker-compose.yml ]; then
  say "[install] keeping the existing docker-compose.yml"
else
  curl -fsSL "$COMPOSE_URL" -o docker-compose.yml || fail "could not download $COMPOSE_URL"
  say "[install] downloaded docker-compose.yml"
fi

if [ -f .env ]; then
  say "[install] keeping the existing .env"
else
  zone="$(host_zone || true)"
  {
    say "PUID=${SUDO_UID:-$(id -u)}"
    say "PGID=${SUDO_GID:-$(id -g)}"
    say "# TZ=${zone:-Australia/Sydney}"
  } > .env
  say "[install] wrote .env:"
  sed 's/^/    /' .env
  answer="$(ask 'Files will be owned by this PUID and PGID. Start now? [Y/n/e = edit .env first]')"
  case "$answer" in
    n|N) say "[install] stopped. Edit $FREETVARR_DIR/.env, then run: docker compose up -d"; exit 0 ;;
    e|E) "${EDITOR:-vi}" .env < /dev/tty > /dev/tty ;;
  esac
fi

docker compose pull
docker compose up -d

port="$(sed -n 's/^FREETVARR_PORT=//p' .env)"
address="$(host_address || true)"
say ""
say "[install] Freetvarr is starting. Open http://${address:-<this-host-ip>}:${port:-3733} to run the setup wizard."
say "[install] To update later: cd $FREETVARR_DIR && docker compose pull && docker compose up -d"
