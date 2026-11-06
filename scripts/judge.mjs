#!/usr/bin/env node
// 審査の期間中、審査員とみんなが触れる版を、この PC で動かし続ける（BACKLOG 0-1c）。
// 昼休みの試用版（scripts/trial.mjs、3201/3202）とは別の worktree・別のポート・別の DB で動かし、互いに止めない。
//
//   npm run judge                          動いていなければ起動する（初回は今のコミット）。PC の起動時にもこれを呼ぶ
//   npm run judge -- --update <コミット>   その版を書き出し、サーバーだけ入れ替える（URL は変わらない）
//   npm run judge -- --funnel              Tailscale Funnel で外へ出し、固定の URL を記録する（Tailscale のサインインのあと1回）
//   npm run judge -- --url <審査員用> <みんな用>   Funnel 以外（ngrok など）で出したときに、URL を記録する
//   npm run judge:stop                     全部止める
//
// 審査員用（3301）：合言葉つき、本物の Claude（1時間あたりの回数に上限）、先生も選べる、Teams へは送らない、ダミーの DB。
// みんな用（3302）：合言葉なし、台本モード（キーを渡さず、Claude を呼ばない）、Teams へは送らない。起動のたびに DB を作り直す。
// 合言葉と URL は data/judge.json（Git に入らない）にだけ書く。キーの中身は出さない。
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash, randomInt } from "node:crypto";
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

// タスクスケジューラから呼ばれても同じ場所を使うよう、このファイルの場所から決める
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WT = resolve(ROOT, "..", "koekata-judge-wt");
const DATA = join(ROOT, "data");
const LOGS = join(DATA, "judge-logs");
const STATE = join(DATA, "judge.json");
const NO_GRAPH = join(DATA, "judge-no-graph"); // Teams のトークンを置かない場所（送らないことを確かにする）
const ORIGINS = "*.ts.net,*.ts.net:8443,*.ngrok-free.app,*.ngrok.app";
const NEXT = join("node_modules", "next", "dist", "bin", "next");
const TAILSCALE = process.env.TAILSCALE ?? (process.platform === "win32" ? "C:\\Program Files\\Tailscale\\tailscale.exe" : "tailscale");
const PER_HOUR = process.env.KOEKATA_JUDGE_PER_HOUR ?? "120";

export const SITES = [
  { name: "judge", label: "審査員用", port: 3301, funnel: 443, db: join(DATA, "judge.db") },
  { name: "public", label: "みんな用", port: 3302, funnel: 8443, db: join(DATA, "judge-public.db") },
];

const newCode = () => String(randomInt(100000, 1000000));

function readState() {
  try {
    return JSON.parse(readFileSync(STATE, "utf8"));
  } catch {
    return {};
  }
}

function writeState(state) {
  mkdirSync(DATA, { recursive: true });
  writeFileSync(STATE, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
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

function kill(pid) {
  if (!alive(pid)) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  else process.kill(pid);
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const git = (...args) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8" }).trim();
const digest = (text) => createHash("sha256").update(text).digest("hex").slice(0, 16);

async function healthy(port) {
  try {
    return (await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(5000) })).ok;
  } catch {
    return false;
  }
}

function detached(command, args, options, logName) {
  mkdirSync(LOGS, { recursive: true });
  const log = openSync(join(LOGS, logName), "a");
  const child = spawn(command, args, { ...options, detached: true, stdio: ["ignore", log, log], windowsHide: true });
  child.unref();
  return child.pid;
}

/** worktree をそのコミットにして、依存を入れ、使っていない書き出し先に書き出す */
function prepare(commit, state) {
  const sha = git("rev-parse", "--verify", `${commit}^{commit}`);
  if (!existsSync(WT)) {
    console.log(`審査用の置き場所を作ります：${WT}`);
    git("worktree", "add", "--detach", WT, sha);
  } else {
    execFileSync("git", ["-C", WT, "checkout", "--detach", "--force", sha], { stdio: "ignore" });
  }
  const lock = digest(readFileSync(join(WT, "package-lock.json"), "utf8"));
  if (!existsSync(join(WT, NEXT)) || state.lock !== lock) {
    console.log("依存を入れています…");
    const result = spawnSync("npm ci --no-audit --no-fund", { cwd: WT, stdio: "inherit", shell: true });
    if (result.status !== 0) throw new Error("npm ci に失敗しました。前の版のまま動いています");
  }
  const slot = state.slot === ".next-a" ? ".next-b" : ".next-a";
  console.log(`${sha.slice(0, 7)} を書き出しています（${slot}）…`);
  const result = spawnSync(process.execPath, [NEXT, "build"], {
    cwd: WT,
    stdio: "inherit",
    env: { ...process.env, KOEKATA_DIST_DIR: slot, KOEKATA_ALLOWED_ORIGINS: ORIGINS },
  });
  if (result.status !== 0) throw new Error("書き出しに失敗しました。前の版のまま動いています");
  return { commit: sha, slot, lock };
}

/** それぞれのサーバーに渡す設定。どちらも Teams へは送らない */
export function siteEnv(site, base, { slot, code }) {
  const env = {
    ...base,
    KOEKATA_DIST_DIR: slot,
    KOEKATA_ALLOWED_ORIGINS: ORIGINS,
    KOEKATA_DB_PATH: site.db,
    KOEKATA_TEAMS: "off",
    KOEKATA_GRAPH_DIR: NO_GRAPH,
    KOEKATA_NOTICE_ALWAYS: "1",
  };
  delete env.KOEKATA_TRIAL_TEAMS_AS;
  delete env.KOEKATA_TEAMS_WEBHOOK_URL;
  if (site.name === "judge") {
    Object.assign(env, { KOEKATA_ACCESS_CODE: code, KOEKATA_TRIAL_AUDIENCE: "teacher", KOEKATA_CLAUDE_PER_HOUR: PER_HOUR, KOEKATA_FEEDBACK: "off" });
  } else {
    // みんな用は Claude を呼ばない。キーそのものを渡さない
    delete env.ANTHROPIC_API_KEY;
    delete env.KOEKATA_ACCESS_CODE;
    delete env.KOEKATA_TRIAL_AUDIENCE;
    env.KOEKATA_CLAUDE = "scripted";
  }
  return env;
}

function startServer(site, slot, code) {
  // みんな用は、だれが何を書いても次の起動で消えるよう、毎回まっさらから始める
  if (site.name === "public") for (const suffix of ["", "-wal", "-shm"]) rmSync(`${site.db}${suffix}`, { force: true });
  return detached(
    process.execPath,
    [NEXT, "start", "--hostname", "127.0.0.1", "--port", String(site.port)],
    { cwd: WT, env: siteEnv(site, process.env, { slot, code }) },
    `${site.name}.log`,
  );
}

async function startServers(state, slot) {
  const servers = {};
  for (const site of SITES) {
    kill(state.servers?.[site.name]);
    servers[site.name] = startServer(site, slot, state.code);
  }
  for (const site of SITES) {
    let ok = false;
    for (let i = 0; i < 120 && !ok; i++) {
      ok = await healthy(site.port);
      if (!ok) await sleep(1000);
    }
    if (!ok) throw new Error(`${site.label}のサーバーが起動しませんでした（${join(LOGS, `${site.name}.log`)}）`);
  }
  return servers;
}

/** Tailscale Funnel で外へ出す。設定は Tailscale 側に残るので、PC を起動し直しても同じ URL で開く */
function funnel(state) {
  const run = (...args) => execFileSync(TAILSCALE, args, { encoding: "utf8" });
  for (const site of SITES) run("funnel", "--bg", `--https=${site.funnel}`, `http://127.0.0.1:${site.port}`);
  const name = JSON.parse(run("status", "--json")).Self?.DNSName?.replace(/\.$/, "");
  if (!name) throw new Error("Tailscale の名前を読めませんでした。サインインを確かめてください");
  state.urls = Object.fromEntries(SITES.map((site) => [site.name, site.funnel === 443 ? `https://${name}` : `https://${name}:${site.funnel}`]));
}

function stopAll() {
  const state = readState();
  for (const pid of Object.values(state.servers ?? {})) kill(pid);
  writeState({ ...state, servers: {} });
  console.log("審査用を止めました（Funnel の設定は残っています。外したいときは tailscale funnel reset）");
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "stop") return stopAll();
  nextEnv.loadEnvConfig(ROOT, false, { info: () => {}, error: console.error });
  mkdirSync(NO_GRAPH, { recursive: true });

  const state = readState();
  if (!/^\d{6}$/.test(state.code ?? "")) state.code = newCode();

  const at = args.indexOf("--update");
  if (at >= 0) {
    const commit = args[at + 1];
    if (!commit) throw new Error("入れ替えるコミットを指定してください（例：npm run judge -- --update main）");
    const prepared = prepare(commit, state);
    state.servers = await startServers(state, prepared.slot);
    Object.assign(state, prepared);
    console.log("サーバーを入れ替えました");
  } else if (!SITES.every((site) => alive(state.servers?.[site.name]))) {
    const built = state.commit && state.slot && existsSync(join(WT, state.slot, "BUILD_ID"));
    const prepared = built ? { commit: state.commit, slot: state.slot, lock: state.lock } : prepare(state.commit ?? "HEAD", state);
    state.servers = await startServers(state, prepared.slot);
    Object.assign(state, prepared);
    console.log("サーバーを起動しました");
  }

  if (args.includes("--funnel")) funnel(state);
  const urlAt = args.indexOf("--url");
  if (urlAt >= 0) state.urls = { judge: args[urlAt + 1], public: args[urlAt + 2] };
  state.startedAt = new Date().toISOString();
  writeState(state);

  console.log(`版：${state.commit.slice(0, 7)}`);
  for (const site of SITES) console.log(`${site.label}：${state.urls?.[site.name] ?? `（まだ外に出していません。手元は http://127.0.0.1:${site.port}）`}`);
  console.log(`合言葉と URL は ${STATE} にあります`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
