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

echo "== 型の確認"
npm run --silent typecheck

echo "== Vitest"
npm run --silent test:unit

echo "== Playwright"
npx playwright install chromium
npm run --silent test:e2e

echo "すべて通りました"
