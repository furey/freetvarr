#!/usr/bin/env bash
end=$(( $(date +%s) + 7200 ))
while [ $(date +%s) -lt $end ]; do
  if ! docker ps >/dev/null 2>&1; then
    echo "$(date) docker down; restarting OrbStack"
    orbctl start >/dev/null 2>&1; sleep 3
    docker start ftv-video-tvh >/dev/null 2>&1
  fi
  sleep 15
done
