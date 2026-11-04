#!/usr/bin/env bash
# scripts/codex-review.sh のテスト。偽の codex を使うので、本物の回数は減らない。
set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd -P)/scripts/codex-review.sh"
WORK="$(mktemp -d)"
WORK="$(cd "$WORK" && pwd -P)"
trap 'rm -rf "$WORK"' EXIT

fail() { echo "失敗: $1" >&2; exit 1; }

# 偽の codex：引数と標準入力を記録し、-o のファイルに結果を書く
mkdir -p "$WORK/bin"
cat >"$WORK/bin/codex" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$@" >"$STUB_LOG/args"
cat >"$STUB_LOG/stdin"
echo called >>"$STUB_LOG/calls"
[ "${STUB_FAIL:-}" = "1" ] && exit 3
if [ "${STUB_HANG:-}" = "1" ]; then
  # 子プロセスを残して固まる。時間切れでこの子まで止まることを確かめる
  sleep 30 &
  echo "$!" >"$STUB_LOG/child"
  wait
fi
while [ "$#" -gt 0 ]; do
  if [ "$1" = "-o" ]; then echo "指摘なし $STUB_REPO/a.txt" >"$2"; fi
  shift
done
STUB
chmod +x "$WORK/bin/codex"
export PATH="$WORK/bin:$PATH"

REPO="$WORK/repo"
mkdir -p "$REPO/scripts" "$WORK/log"
cp "$SRC" "$REPO/scripts/"
g() { git -C "$REPO" -c user.name=t -c user.email=t@example.com -c commit.gpgsign=false "$@"; }
g init -q
echo 1 >"$REPO/a.txt"
g add -A
g commit -qm first
# スクリプトが見るパスは git が返す形（Windows では C:/...）なので、比べるときもそれを使う
REPO_TOP="$(g rev-parse --show-toplevel)"
export STUB_LOG="$WORK/log" STUB_REPO="$REPO_TOP"
calls() { wc -l <"$WORK/log/calls" | tr -d ' '; }
reviews() { ls "$REPO/reviews" 2>/dev/null | wc -l | tr -d ' '; }

# 読むだけの指定で呼び、標準入力を渡さず、結果を保存する
echo "渡らないはずの入力" | "$REPO/scripts/codex-review.sh" >/dev/null
args="$(cat "$WORK/log/args")"
for want in --sandbox read-only --ephemeral --cd "$REPO_TOP"; do
  grep -qxF -- "$want" <<<"$args" || fail "引数に $want がない"
done
[ ! -s "$WORK/log/stdin" ] || fail "標準入力が閉じていない"
[ "$(reviews)" = "1" ] || fail "結果が保存されていない"
report="$(ls "$REPO"/reviews/*.md)"
[[ "$(basename "$report")" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{6}\.md$ ]] || fail "ファイル名に日付がない"
grep -q "^reviewed-commit: $(g rev-parse HEAD)$" "$report" || fail "コミットが記録されていない"
if grep -qF "$REPO_TOP" "$report"; then fail "絶対パスが残っている"; fi

# 変更がなければ呼ばない
"$REPO/scripts/codex-review.sh" >/dev/null
[ "$(calls)" = "1" ] || fail "変更がないのに Codex を呼んだ"

# 次のレビューは前回のコミットから比べる
first="$(g rev-parse HEAD)"
g add reviews
g commit -qm "review"
echo 2 >>"$REPO/a.txt"
g add -A
g commit -qm second
sleep 1 # ファイル名は秒単位
"$REPO/scripts/codex-review.sh" >/dev/null
[ "$(calls)" = "2" ] || fail "変更があるのに Codex を呼ばなかった"
grep -qF "git diff $first" "$WORK/log/args" || fail "前回のコミットから比べていない"

# 失敗したら結果を保存せず、失敗で終わる
echo 3 >>"$REPO/a.txt"
before="$(reviews)"
if STUB_FAIL=1 "$REPO/scripts/codex-review.sh" >/dev/null 2>&1; then fail "失敗が伝わっていない"; fi
[ "$(reviews)" = "$before" ] || fail "失敗したのに結果を保存した"

# 固まったら時間切れで止まる（夜の作業を止めない）
start="$SECONDS"
if STUB_HANG=1 CODEX_REVIEW_TIMEOUT=1 "$REPO/scripts/codex-review.sh" >/dev/null 2>&1; then fail "時間切れが伝わっていない"; fi
[ "$((SECONDS - start))" -lt 4 ] || fail "時間切れで止まっていない"
[ "$(reviews)" = "$before" ] || fail "時間切れなのに結果を保存した"

# 時間切れのとき、子プロセスが残らない
child_gone() {
  local pid
  pid="$(cat "$WORK/log/child")"
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
    kill -0 "$pid" 2>/dev/null || return 0
    sleep 0.1
  done
  kill "$pid" 2>/dev/null || true
  fail "$1 の時間切れで子プロセスが残った"
}
child_gone "標準の手段"

# timeout を隠すための PATH。スクリプトと偽の codex が使うコマンドだけを置く
min_path() {
  local dir="$1" name real
  shift
  mkdir -p "$dir"
  cp "$WORK/bin/codex" "$dir/codex"
  for name in git dirname ls tail sed head mktemp rm mkdir date cat sleep "$@"; do
    real="$(command -v "$name")"
    printf '#!%s\nexec "%s" "$@"\n' "$BASH" "$real" >"$dir/$name"
    chmod +x "$dir/$name"
  done
  printf '#!%s\nexec "%s" "$@"\n' "$BASH" "$BASH" >"$dir/bash"
  chmod +x "$dir/bash"
}

# timeout がなくても、perl で時間切れになり、子プロセスも残らない
if command -v perl >/dev/null 2>&1; then
  min_path "$WORK/only-perl" perl
  rm -f "$WORK/log/child"
  start="$SECONDS"
  if STUB_HANG=1 CODEX_REVIEW_TIMEOUT=1 PATH="$WORK/only-perl" "$BASH" "$REPO/scripts/codex-review.sh" >/dev/null 2>&1; then
    fail "perl の時間切れが伝わっていない"
  fi
  # 作ったばかりの PATH の初回実行は Mac で数秒余分にかかる。固まる処理の 30 秒より十分短ければよい
  [ "$((SECONDS - start))" -lt 10 ] || fail "perl の時間切れで止まっていない"
  [ -s "$WORK/log/child" ] || fail "perl の手段で Codex を呼んでいない"
  [ "$(reviews)" = "$before" ] || fail "perl の時間切れなのに結果を保存した"
  child_gone "perl"
fi

# timeout も perl もなければ、Codex を呼ばず、分かるエラーで止まる
min_path "$WORK/no-timer"
called="$(calls)"
if err="$(PATH="$WORK/no-timer" "$BASH" "$REPO/scripts/codex-review.sh" 2>&1 >/dev/null)"; then
  fail "時間切れの手段がないのに成功した"
fi
grep -qF "timeout も perl も見つかりません" <<<"$err" || fail "時間切れの手段がないことを伝えていない: $err"
[ "$(calls)" = "$called" ] || fail "時間切れの手段がないのに Codex を呼んだ"
[ "$(reviews)" = "$before" ] || fail "時間切れの手段がないのに結果を保存した"

echo "ok"
