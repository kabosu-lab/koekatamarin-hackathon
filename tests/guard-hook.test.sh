#!/usr/bin/env bash
# .claude/hooks/guard.mjs のテスト。止めるものと通すものを実際に流して確かめる。
set -euo pipefail
cd "$(dirname "$0")/.."

fail() { echo "失敗: $1" >&2; exit 1; }

# $1: 期待（deny / ask / none）、$2: ツール名、$3: 入力の項目名、$4: 値
check() {
  local out got
  out="$(node -e 'process.stdout.write(JSON.stringify({tool_name:process.argv[1],tool_input:{[process.argv[2]]:process.argv[3]}}))' "$2" "$3" "$4" | node .claude/hooks/guard.mjs)"
  case "$out" in
    *'"permissionDecision":"deny"'*) got=deny ;;
    *'"permissionDecision":"ask"'*) got=ask ;;
    "") got=none ;;
    *) fail "想定外の出力: $out" ;;
  esac
  [ "$got" = "$1" ] || fail "$2 $4 は $1 のはずが $got"
}

check deny Read file_path "C:/work/repo/.env"
check deny Read file_path ".env"
check deny Read file_path "C:\work\repo\.env.local"
check deny Write file_path "/repo/.env.production"
check deny Edit file_path "/repo/.env"
check deny Grep path ".env"
check deny Grep glob ".env*"
check deny Bash command "cat .env"
check deny Bash command "grep KEY ./.env | head"
check deny Bash command "echo A=1 >> .env"
check deny PowerShell command "Get-Content .env"

check none Read file_path "C:/work/repo/.env.example"
check none Read file_path "/repo/src/lib/env.ts"
check none Read file_path "/repo/my.environment"
check none Bash command "cat .env.example"
check none Bash command "npx tsx --env-file-if-exists=.envx a.ts"
check none Bash command "git status"
check none Bash command "git log --grep=push"

check ask Bash command "git push origin main"
check ask Bash command "git add a && git commit -m x && git push"
check ask Bash command "git -C /repo push"
check ask PowerShell command "git push origin main"
# 文字列の中でも確認を出す（安全側）
check ask Bash command "echo git push の説明"

echo "guard-hook: 通りました"
