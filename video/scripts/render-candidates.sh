#!/usr/bin/env bash
# 候補 A〜D を out/candidate-*.mp4 に書き出し、もう一方の表記の作品名の画面を out/stills/ に撮る
set -uo pipefail
cd "$(dirname "$0")/.."
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
trap 'pkill -f puppeteer_dev_chrome_profile || true' EXIT
npx remotion bundle src/index.jsx --out-dir=out/bundle --log=error >/dev/null
failed=0
render() { npx remotion render out/bundle "$1" "out/candidate-$2.mp4" --codec=h264 --crf=18 --browser-executable="$CH" --log=error || { echo "書き出せませんでした: $1" >&2; failed=1; }; }
render A-hira A-shizuka
render B-kata B-jitsugamen
render C-hira C-tegami
render D-kata D-totonoe
# 生成画像を使わず、コードで描いた絵の版
render A-hira-code A-shizuka-code
render C-hira-code C-tegami-code
render D-kata-code D-totonoe-code
for f in out/candidate-*.mp4; do
  echo "== $f"
  ffprobe -v error -show_entries format=duration,size -of csv=p=0 "$f"
  ffmpeg -hide_banner -i "$f" -af volumedetect -f null - 2>&1 | grep -E "mean_volume|max_volume"
done
for id in A-hira A-kata B-hira B-kata C-hira C-kata D-hira D-kata; do
  npx remotion still out/bundle "$id" "out/stills/title-$id.png" --frame=440 --browser-executable="$CH" --log=error >/dev/null 2>&1
done
python3 - <<'PY'
from PIL import Image
W,H=640,360; ids=['A-hira','A-kata','B-hira','B-kata','C-hira','C-kata','D-hira','D-kata']; s=Image.new('RGB',(W*4+12,H*2+4),'white')
for n,i in enumerate(ids):
    p=f'out/stills/title-{i}.png'
    im=Image.open(p)
    s.paste(im.convert('RGB').resize((W,H)),((n%4)*(W+4),(n//4)*(H+4)))
s.save('out/titles.png')
PY
ls -la out/*.mp4 out/titles.png
exit "$failed"
