#!/usr/bin/env node
// 審査用（scripts/judge.mjs）の見張り。タスクスケジューラから数時間おきに動かす（BACKLOG 0-1c (d)）。
//   npm run judge:watch
// 1. 手元のサーバーと、外の URL（cloudflared の一時トンネルなど）から /api/health を開く
// 2. 手元のサーバーが落ちていれば、judge.mjs で起こし直す
// 3. トンネルで出しているとき、cloudflared のプロセスが止まっていたときだけ開き直す（新しい URL は data/judge.json）。
//    動いている cloudflared には触らない（URL が変わると提出フォームの URL が使えなくなる）
// 4. どれでも、開発の足跡の Teams に一文を残す（alert。URL と合言葉は書かない）。記録は data/judge-logs/watch.log
// 開けたときは何も送らない（うるさくしない）。
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { changedUrls, watchPlan } from "./judge-tunnel.mjs";

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

function alive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
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
const tunnel = state.expose === "tunnel";
const checks = {};
for (const site of SITES) {
  const local = await opens(`http://127.0.0.1:${site.port}`);
  const tunnelAlive = tunnel ? alive(state.tunnels?.[site.name]) : null;
  const url = state.urls?.[site.name];
  const outside = url && tunnelAlive !== false ? await opens(url) : null;
  checks[site.name] = { local, tunnelAlive, outside };
}
const { restartServers, restartTunnels, problems } = watchPlan(SITES, checks, state.expose);

if (restartServers || restartTunnels.length > 0) {
  // judge.mjs は、止まっているサーバーとトンネルだけを起こす（動いているトンネルはそのまま）
  const args = [join(ROOT, "scripts", "judge.mjs"), ...(tunnel ? ["--tunnel"] : [])];
  const result = spawnSync(process.execPath, args, { cwd: ROOT, stdio: "ignore", timeout: 15 * 60_000 });
  problems.push(result.status === 0 ? "起こし直した" : "起こし直せなかった（data/judge-logs を見る）");
  const changed = changedUrls(SITES, state.urls, readState().urls);
  if (changed.length > 0) problems.push(`${changed.join("と")}の URL が変わった（data/judge.json を見て、提出フォームの URL を直す）`);
}

if (problems.length === 0) {
  log("ok");
} else {
  const text = problems.join("。");
  log(text);
  alert(text);
}
