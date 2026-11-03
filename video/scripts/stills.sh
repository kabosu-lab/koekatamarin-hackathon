#!/usr/bin/env bash
# 使い方: scripts/stills.sh 30 95 150 … 指定のコマを out/stills に書き出し、一覧 out/contact.png を作る
set -euo pipefail
cd "$(dirname "$0")/.."
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
mkdir -p out/stills
npx remotion bundle src/index.jsx --out-dir=out/bundle --log=error >/dev/null
for f in "$@"; do
  npx remotion still out/bundle Trial "out/stills/$f.png" --frame="$f" --browser-executable="$CH" --log=error >/dev/null
done
python3 - "$@" <<'PY'
import sys
from PIL import Image
fr=sys.argv[1:]; W,H=384,216; R=(len(fr)+3)//4; sheet=Image.new('RGB',(W*4+12,(H+4)*R),'white')
for i,f in enumerate(fr):
    sheet.paste(Image.open(f'out/stills/{f}.png').convert('RGB').resize((W,H)),((i%4)*(W+4),(i//4)*(H+4)))
sheet.save('out/contact.png')
PY
