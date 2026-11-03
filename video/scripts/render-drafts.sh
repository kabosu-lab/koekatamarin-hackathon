#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")/.."
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
trap 'pkill -f puppeteer_dev_chrome_profile || true' EXIT
npx remotion bundle src/index.jsx --out-dir=out/bundle --log=error >/dev/null || exit 1
for pair in "Story-hira story-draft-hira" "Chapters-hira chapters-draft-hira" "F-hira candidate-F-yoru-jitsuga"; do
  set -- $pair
  npx remotion render out/bundle "$1" "out/$2.mp4" --codec=h264 --crf=20 --browser-executable="$CH" --log=error >/dev/null || { echo "失敗 $1"; continue; }
  echo "$2 $(ffprobe -v error -show_entries format=duration -of csv=p=0 "out/$2.mp4")"
done
for n in chapters-draft-hira story-draft-hira; do ffmpeg -y -loglevel error -i "out/$n.mp4" -vf scale=1280:-2 -crf 27 -preset medium -c:a aac -b:a 96k "out/$n-small.mp4"; done
ls -la out/*-small.mp4
ffmpeg -nostats -i out/story-draft-hira.mp4 -af volumedetect -f null - 2>&1 | grep -E "mean_volume|max_volume"
