#!/usr/bin/env node
// PreToolUse のフック。.env の読み書きを止め、git push は毎回人に確認する（CLAUDE.md の決まり）。
// 標準入力でツールの呼び出しを受け取り、判定を JSON で返す。何も返さなければ通常の流れに任せる。
import { readFileSync } from "node:fs";

// 区切りのあとの .env と .env.local など。.env.example と .env.sample は見本なので対象外。\x5c はバックスラッシュ。
const ENV_FILE = /(^|[\s"'`=:;|&<>(/\x5c])\.env(?!\.(?:example|sample)(?![\w.-]))(?:\.[\w-]+)?\*?(?=$|[\s"'`;|&<>)])/;
// 文字列の中の git push でも確認を出す。出すぎても人が1回答えるだけで、止め損ねるより安全。
const GIT_PUSH = /(^|[;&|(\n]\s*|\s)git(\s+-[^\s]+(\s+[^\s-][^\s]*)?)*\s+push(\s|$)/;
const NO_ENV = ".env は読み書きしない決まりです（CLAUDE.md）";

function decide(input) {
  const tool = input.tool_name ?? "";
  const args = input.tool_input ?? {};
  if (tool === "Bash" || tool === "PowerShell") {
    const command = String(args.command ?? "");
    if (ENV_FILE.test(command)) return ["deny", NO_ENV];
    if (GIT_PUSH.test(command)) return ["ask", "GitHub への push は人の確認後です（CLAUDE.md）"];
    return null;
  }
  const targets = [args.file_path, args.notebook_path, args.path, args.glob, args.pattern];
  const isSearch = tool === "Grep";
  // Grep の pattern は本文を探す文字列で、ファイル名ではないので見ない
  const paths = isSearch ? targets.filter((value) => value !== args.pattern) : targets;
  if (paths.some((value) => typeof value === "string" && ENV_FILE.test(value))) return ["deny", NO_ENV];
  return null;
}

const verdict = decide(JSON.parse(readFileSync(0, "utf8") || "{}"));
if (verdict) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: verdict[0],
        permissionDecisionReason: verdict[1],
      },
    }),
  );
}
