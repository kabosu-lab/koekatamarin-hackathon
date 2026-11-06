#!/usr/bin/env node
// 審査用（scripts/judge.mjs）の見張り。タスクスケジューラから数時間おきに動かす（BACKLOG 0-1c (d)）。
//   npm run judge:watch
// 1. 外の URL（Funnel など）から /api/health を開く。開けなければ、手元のサーバーも確かめる
// 2. 手元のサーバーが落ちていれば、judge.mjs で起こし直す
// 3. どちらでも、開発の足跡の Teams に一文を残す（URL と合言葉は書かない）。記録は data/judge-logs/watch.log
// 開けたときは何も送らない（うるさくしない）。
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const LOGS = join(DATA, "judge-logs");
const STATE = join(DATA, "judge.json");
const SITES = [
  { name: "judge", label: "審査員用", port: 3301 },
  { name: "public", label: "みんな用", port: 3302 },
];

function readState() {
  try {
    return JSON.parse(readFileSync(STATE, "utf8"));
  } catch {
    return {};
  }
}

async function opens(url) {
  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/api/health`, { signal: AbortSignal.timeout(15_000) });
    return response.ok;
  } catch {
    return false;
  }
}

function log(line) {
  mkdirSync(LOGS, { recursive: true });
  appendFileSync(join(LOGS, "watch.log"), `${new Date().toISOString()} ${line}\n`);
  console.log(line);
}

function alert(text) {
  spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["--no-install", "tsx", "scripts/dev-log.ts", "alert", text], {
    cwd: ROOT,
    stdio: "ignore",
    shell: process.platform === "win32",
    timeout: 60_000,
  });
}

const state = readState();
const problems = [];
let restart = false;
for (const site of SITES) {
  const local = await opens(`http://127.0.0.1:${site.port}`);
  const url = state.urls?.[site.name];
  const outside = url ? await opens(url) : null;
  if (!local) {
    restart = true;
    problems.push(`${site.label}のサーバーが止まっていた`);
  } else if (outside === false) {
    problems.push(`${site.label}は手元では動いているが、外から開けない（Tailscale Funnel を確かめる）`);
  }
}

if (restart) {
  const result = spawnSync(process.execPath, [join(ROOT, "scripts", "judge.mjs")], { cwd: ROOT, stdio: "ignore", timeout: 15 * 60_000 });
  problems.push(result.status === 0 ? "起こし直した" : "起こし直せなかった（data/judge-logs を見る）");
}

if (problems.length === 0) {
  log("ok");
} else {
  const text = problems.join("。");
  log(text);
  alert(text);
}
