#!/usr/bin/env bash
# すべてのテストの入口。新しいテストはここから動くように足す。
set -euo pipefail
cd "$(dirname "$0")/.."

for f in scripts/*.sh tests/*.sh; do
  bash -n "$f"
done

for t in tests/*.test.sh; do
  echo "== $t"
  bash "$t"
done

[ -x node_modules/.bin/next ] || npm ci

# 件数を開発の足跡に書くため、出力を一時ファイルにも残す
log="$(mktemp)"
trap 'rm -f "$log"' EXIT

echo "== 型の確認"
npm run --silent typecheck

echo "== Vitest"
npm run --silent test:unit 2>&1 | tee -a "$log"

echo "== Playwright"
npx playwright install chromium
npm run --silent test:e2e 2>&1 | tee -a "$log"

echo "すべて通りました"

# 開発の足跡（設定がなければ黙って飛ばす。失敗してもテストは落とさない）
npx --no-install tsx scripts/dev-log.ts test "$log" || true
