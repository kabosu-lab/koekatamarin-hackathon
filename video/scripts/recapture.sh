#!/usr/bin/env bash
# コミット済みのアプリを別の場所に取り出し、台本モードで動かして実画面を撮り直す
# 開発のタブの作業中の変更や .next、.env、手元のデータには触らない
set -euo pipefail
cd "$(dirname "$0")/.."
VIDEO="$PWD"; ROOT="$(cd .. && pwd)"; COPY="$VIDEO/out/app-copy"; PORT=3177
# Windows（Git Bash）の ln -s は中身を丸ごと写すので、フォルダの別名（ジャンクション）を作る
link_dir() {
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*) cmd //c mklink /J "$(cygpath -w "$2")" "$(cygpath -w "$1")" >/dev/null ;;
    *) ln -s "$1" "$2" ;;
  esac
}
# 前の写しを消す前に、別名だけを外す（先の node_modules などの中身は消さない）。
# Windows の rmdir は、/s を付けなければ別名だけを外し、中身のあるふつうのフォルダは消さない
for linked in "$COPY/node_modules" "$COPY/.private/art"; do
  [ -e "$linked" ] || [ -L "$linked" ] || continue
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*) cmd //c rmdir "$(cygpath -w "$linked")" 2>/dev/null || true ;;
    *) [ -L "$linked" ] && rm "$linked" ;;
  esac
done
rm -rf "$COPY"; mkdir -p "$COPY"
git -C "$ROOT" archive HEAD -- . ':!video' | tar -x -C "$COPY"
link_dir "$ROOT/node_modules" "$COPY/node_modules"
# 絵は Git に入らないので、手元の .private/art を見えるようにする（動画の中でだけ使う）
mkdir -p "$COPY/.private" && link_dir "$ROOT/.private/art" "$COPY/.private/art"
cd "$COPY"
# 台本で動かし、Teams へは送らない（撮影から本物のチャネルに投稿しない）
export KOEKATA_CLAUDE=scripted KOEKATA_TEAMS=off KOEKATA_DB_PATH="$COPY/video.db"
npx next build --webpack >/dev/null
npx tsx scripts/make-demo-attachments.ts >/dev/null
export DEMO_CERTIFICATE="$COPY/data/demo-attachments/demo-certificate.png"
npx next start --hostname 127.0.0.1 --port "$PORT" >/dev/null 2>&1 &
SERVER=$!
# Windows では npx を止めても next の本体が残るので、ポートを使っているものも止める
stop_server() {
  kill "$SERVER" 2>/dev/null || true
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*)
      for pid in $(netstat -ano | grep "127.0.0.1:$PORT .*LISTENING" | awk '{print $NF}' | sort -u); do taskkill //PID "$pid" //T //F >/dev/null 2>&1 || true; done ;;
  esac
}
trap stop_server EXIT
for _ in $(seq 1 40); do curl -sf -o /dev/null "http://127.0.0.1:$PORT/api/health" && break; /bin/sleep 1; done
cd "$VIDEO"
rm -rf public/app
APP_URL="http://127.0.0.1:$PORT" node scripts/capture-app.mjs
APP_URL="http://127.0.0.1:$PORT" node scripts/capture-features.mjs
APP_URL="http://127.0.0.1:$PORT" node scripts/capture-take.mjs
git -C "$ROOT" rev-parse --short HEAD > public/app/commit.txt
