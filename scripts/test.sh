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

echo "すべて通りました"
