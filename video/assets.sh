#!/usr/bin/env bash
VIDEO=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO=$(cd "$VIDEO/.." && pwd)
export FTV_VIDEO_ASSETS="${FTV_VIDEO_ASSETS:-$HOME/code/repos/furey/freetvarr-video-assets}"
export FTV_VIDEO_PYTHON="${FTV_VIDEO_PYTHON:-python3}"
PLAYWRIGHT_VERSION="${PLAYWRIGHT_VERSION:-1.49.0}"
PLAYWRIGHT_DIR="$REPO/scripts/.cache/playwright-$PLAYWRIGHT_VERSION"

[ -d "$FTV_VIDEO_ASSETS" ] || { echo "[video] assets folder not found: $FTV_VIDEO_ASSETS" >&2; exit 1; }

if [ ! -d "$PLAYWRIGHT_DIR/node_modules/playwright" ]; then
  echo "[video] installing playwright@$PLAYWRIGHT_VERSION in ${PLAYWRIGHT_DIR#"$REPO"/}"
  mkdir -p "$PLAYWRIGHT_DIR"
  (cd "$PLAYWRIGHT_DIR" && npm init -y >/dev/null && \
    npm install --silent --no-save --no-audit --no-fund "playwright@$PLAYWRIGHT_VERSION")
  (cd "$PLAYWRIGHT_DIR" && npx --no-install playwright install chromium >/dev/null)
fi

link() {
  local target=$1 path=$2
  [ -L "$path" ] && [ "$(readlink "$path")" = "$target" ] && return
  [ -e "$path" ] && [ ! -L "$path" ] && { echo "[video] $path exists and is not a link; left as is" >&2; return; }
  mkdir -p "$(dirname "$path")"
  ln -sfn "$target" "$path"
}

link "$PLAYWRIGHT_DIR/node_modules" "$VIDEO/node_modules"
link "$FTV_VIDEO_ASSETS/voice/overview" "$VIDEO/eleven/cache"
link "$FTV_VIDEO_ASSETS/voice/series" "$VIDEO/series/eleven-cache"
link "$FTV_VIDEO_ASSETS/frames/overview" "$VIDEO/stage/frames"
link "$FTV_VIDEO_ASSETS/frames/series" "$VIDEO/series/stage/frames"
link "$FTV_VIDEO_ASSETS/stack-host" "$VIDEO/stack/host"
link "$FTV_VIDEO_ASSETS/stack-host/hd" "$VIDEO/stage/media/hd"
link "$FTV_VIDEO_ASSETS/stack-host/hd" "$VIDEO/series/stage/media/hd"
link "$REPO/docs/.vitepress/theme/fonts" "$VIDEO/stage/fonts"
link "$REPO/docs/.vitepress/theme/fonts" "$VIDEO/series/stage/fonts"
link "$REPO/src/web/icon-512.png" "$VIDEO/series/stage/assets/icon-512.png"
