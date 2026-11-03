#!/usr/bin/env bash
# 使い方: scripts/stills-candidate.sh A-hira 30 95 150 … 指定のコマを out/stills/<作品>/ に書き出し、一覧 out/contact-<作品>.png を作る
set -euo pipefail
cd "$(dirname "$0")/.."
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
ID="$1"; shift
trap 'pkill -f puppeteer_dev_chrome_profile || true' EXIT
mkdir -p "out/stills/$ID"
for f in "$@"; do
  npx remotion still out/bundle "$ID" "out/stills/$ID/$f.png" --frame="$f" --browser-executable="$CH" --log=error >/dev/null
done
python3 - "$ID" "$@" <<'PY'
import sys
from PIL import Image
i=sys.argv[1]; fr=sys.argv[2:]; W,H=480,270; C=4; R=(len(fr)+C-1)//C; sheet=Image.new('RGB',(W*C+4*(C-1),(H+4)*R),'white')
for n,f in enumerate(fr):
    sheet.paste(Image.open(f'out/stills/{i}/{f}.png').convert('RGB').resize((W,H)),((n%C)*(W+4),(n//C)*(H+4)))
sheet.save(f'out/contact-{i}.png')
PY
