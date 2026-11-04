#!/usr/bin/env bash
# コミット済みのアプリを別の場所に取り出し、台本モードで動かして実画面を撮り直す
# 開発のタブの作業中の変更や .next、.env、手元のデータには触らない
set -euo pipefail
cd "$(dirname "$0")/.."
VIDEO="$PWD"; ROOT="$(cd .. && pwd)"; COPY="$VIDEO/out/app-copy"; PORT=3177
rm -rf "$COPY"; mkdir -p "$COPY"
git -C "$ROOT" archive HEAD -- . ':!video' | tar -x -C "$COPY"
ln -s "$ROOT/node_modules" "$COPY/node_modules"
# 絵は Git に入らないので、手元の .private/art を見えるようにする（動画の中でだけ使う）
mkdir -p "$COPY/.private" && ln -s "$ROOT/.private/art" "$COPY/.private/art"
cd "$COPY"
export KOEKATA_CLAUDE=scripted KOEKATA_DB_PATH="$COPY/video.db"
npx next build --webpack >/dev/null
npx tsx scripts/make-demo-attachments.ts >/dev/null
export DEMO_CERTIFICATE="$COPY/data/demo-attachments/demo-certificate.png"
npx next start --hostname 127.0.0.1 --port "$PORT" >/dev/null 2>&1 &
SERVER=$!
trap 'kill "$SERVER" 2>/dev/null || true' EXIT
for _ in $(seq 1 40); do curl -sf -o /dev/null "http://127.0.0.1:$PORT/api/health" && break; /bin/sleep 1; done
cd "$VIDEO"
rm -rf public/app
APP_URL="http://127.0.0.1:$PORT" node scripts/capture-app.mjs
APP_URL="http://127.0.0.1:$PORT" node scripts/capture-features.mjs
APP_URL="http://127.0.0.1:$PORT" node scripts/capture-take.mjs
git -C "$ROOT" rev-parse --short HEAD > public/app/commit.txt
