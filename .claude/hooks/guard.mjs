#!/usr/bin/env node
// PreToolUse のフック。.env の読み書きと、履歴を壊す git の操作を止める。
// origin main への通常の push だけは確認を出さず、ほかの push は人に確認する（利用者が 2026-11-05 に決定）。
// 標準入力でツールの呼び出しを受け取り、判定を JSON で返す。何も返さなければ通常の流れに任せる。
import { readFileSync } from "node:fs";

// 区切りのあとの .env と .env.local など。.env.example と .env.sample は見本なので対象外。\x5c はバックスラッシュ。
const ENV_FILE = /(^|[\s"'`=:;|&<>(/\x5c])\.env(?!\.(?:example|sample)(?![\w.-]))(?:\.[\w-]+)?\*?(?=$|[\s"'`;|&<>)])/;
const NO_ENV = ".env は読み書きしない決まりです（CLAUDE.md）";
// git と、その前置きの引数（git -C dir など）
const GIT = String.raw`(^|[;&|(\n]\s*|\s)git(\s+-[^\s]+(\s+[^\s-][^\s]*)?)*\s+`;
const DESTRUCTIVE = new RegExp(GIT + String.raw`(reset\s+--hard|rebase(\s|$)|filter-branch|filter-repo|commit\s[^;&|]*--amend)`);
const NO_REWRITE = "履歴を壊す操作はしない決まりです（docs/night-loop.md）";
const PUSH = new RegExp(GIT + String.raw`push(\s[^;&|\n]*)?`, "g");
const SAFE_PUSH = /\spush\s+origin\s+main\s*$/;
const FORCE = /\s(--force|--force-with-lease|-f|--mirror|--delete|-d)(\s|=|$)|\s\+\S/;

function decideCommand(command) {
  if (ENV_FILE.test(command)) return ["deny", NO_ENV];
  if (DESTRUCTIVE.test(command)) return ["deny", NO_REWRITE];
  const pushes = [...command.matchAll(PUSH)].map((match) => match[0].trimEnd());
  if (pushes.some((push) => FORCE.test(push.slice(push.indexOf(" push"))))) return ["deny", NO_REWRITE];
  if (pushes.some((push) => !SAFE_PUSH.test(push))) return ["ask", "origin main 以外の push は人に確認します"];
  return null;
}

function decide(input) {
  const tool = input.tool_name ?? "";
  const args = input.tool_input ?? {};
  if (tool === "Bash" || tool === "PowerShell") return decideCommand(String(args.command ?? ""));
  // Grep の pattern は本文を探す文字列で、ファイル名ではないので見ない
  const paths = [args.file_path, args.notebook_path, args.path, args.glob, tool === "Grep" ? undefined : args.pattern];
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
