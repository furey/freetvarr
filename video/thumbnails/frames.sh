#!/bin/bash
set -euo pipefail
SRC="${FTV_VIDEO_RENDERS:-$(cd "$(dirname "$0")/.." && pwd)}"
OUT="$(cd "$(dirname "$0")" && pwd)/work/frames"
mkdir -p "$OUT"
grab() { ffmpeg -v error -y -ss "$3" -i "$2" -frames:v 1 "$OUT/$1.png"; }
S=$SRC/series
grab overview-home     $SRC/freetvarr-overview.mp4                 103.5
grab ov-98           $SRC/freetvarr-overview.mp4                 98
grab intro-guide      $SRC/freetvarr-intro.mp4                    75.1
grab fetch-diagram     $S/leaving-fetch/video-leaving-fetch.mp4    9.62
grab fetch-copy        $S/leaving-fetch/video-leaving-fetch.mp4    7.22
grab fetch-folders     $S/leaving-fetch/video-leaving-fetch.mp4    102.61
grab install-done      $S/install/video-install.mp4                145.8
grab install-terminal  $S/install/video-install.mp4                63.1
grab install-welcome   $S/install/video-install.mp4                76.1
grab rec-sheet         $S/recording/video-recording.mp4            30.0
grab rec-guide         $S/recording/video-recording.mp4            14.2
grab watch-tv          $S/watching/video-watching.mp4              23.0
grab watch-player      $S/watching/video-watching.mp4              76.4
grab lib-posters       $S/library/video-library.mp4                15.9
grab lib-show          $S/library/video-library.mp4                34.1
grab home-home         $S/home-settings/video-home-settings.mp4    21.8
grab home-phone        $S/home-settings/video-home-settings.mp4    10.7
