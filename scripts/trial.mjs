#!/usr/bin/env node
// 学校で数人に触ってもらう試用版を、生徒用と先生用の2つ起動し、それぞれ HTTPS のトンネルで外へ出す。
// 試用版は開発の作業ツリーから切り離し、決まったコミットの worktree（../koekata-trial-wt）から書き出して動かす。
// サーバーとトンネルは、この起動のあとも残る（開発の作業で止まらない）。
//
//   npm run trial                         動いていなければ起動する（初回は今のコミット）。動いていれば URL と版を出す
//   npm run trial -- --update <コミット>  その版を書き出し、サーバーだけ入れ替える。トンネルはそのままで URL は変わらない
//   npm run trial:stop                    全部止める（夜に必ず止める）
//
// 生徒用：本物の Claude（1時間あたりの回数に上限）、話した言葉を覚えさせない、生徒だけを選べる。Teams へは青木の名前で届く。
// 先生用：本物の Claude（1時間あたりの回数に上限）、先生も選べる。Teams へは佐伯の名前で届く。
// どちらもダミーのデータで、開発の DB とは別。合言葉と URL は data/trial.json（Git に入らない）にだけ書く。
// キーと Teams の設定は、開発の作業ツリーのもの（Next と同じ読み方）をそのまま子に渡す。中身は出さない。
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash, randomInt } from "node:crypto";
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import nextEnv from "@next/env";

const ROOT = process.cwd();
const WT = resolve(ROOT, "..", "koekata-trial-wt");
const DATA = join(ROOT, "data");
const LOGS = join(DATA, "trial-logs");
const STATE = join(DATA, "trial.json");
const ORIGINS = "*.trycloudflare.com";
const NEXT = join("node_modules", "next", "dist", "bin", "next");
// Teams へ送るときの名前。生徒用は生徒のダミー、先生用は先生のダミー（どちらもサインイン済みのデモの人物）
const TEAMS_AS = { student: process.env.KOEKATA_TRIAL_STUDENT_AS ?? "aoki", teacher: process.env.KOEKATA_TRIAL_TEACHER_AS ?? "saeki" };
const CLOUDFLARED = process.env.CLOUDFLARED ?? (process.platform === "win32" ? "C:\\Program Files (x86)\\cloudflared\\cloudflared.exe" : "cloudflared");

const SITES = [
  { audience: "student", port: 3201, db: join(DATA, "trial-students.db") },
  { audience: "teacher", port: 3202, db: join(DATA, "trial-teachers.db") },
];
const LABEL = { student: "生徒用", teacher: "先生用" };

// iPhone の数字キーボードで打てるよう、数字6桁にする
const newCode = () => String(randomInt(100000, 1000000));
const usable = (codes) => codes && /^\d{6}$/.test(codes.student ?? "") && /^\d{6}$/.test(codes.teacher ?? "") && codes.student !== codes.teacher;

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
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const digest = (text) => createHash("sha256").update(text).digest("hex").slice(0, 16);

async function healthy(port) {
  try {
    return (await fetch(`http://127.0.0.1:${port}/api/health`)).ok;
  } catch {
    return false;
  }
}

/** この起動が終わっても残るように、切り離して動かす。出力はファイルへ */
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
    console.log(`試用版の置き場所を作ります：${WT}`);
    git("worktree", "add", "--detach", WT, sha);
  } else {
    git("-C", WT, "checkout", "--detach", "--force", sha);
  }
  const lock = digest(readFileSync(join(WT, "package-lock.json"), "utf8"));
  if (!existsSync(join(WT, NEXT)) || state.lock !== lock) {
    console.log("依存を入れています…");
    const result = spawnSync("npm ci --no-audit --no-fund", { cwd: WT, stdio: "inherit", shell: true });
    if (result.status !== 0) throw new Error("npm ci に失敗しました。試用版は前の版のまま動いています");
  }
  const slot = state.slot === ".next-a" ? ".next-b" : ".next-a";
  console.log(`${sha.slice(0, 7)} を書き出しています（${slot}）…`);
  const result = spawnSync(process.execPath, [NEXT, "build"], {
    cwd: WT,
    stdio: "inherit",
    env: { ...process.env, KOEKATA_DIST_DIR: slot, KOEKATA_ALLOWED_ORIGINS: ORIGINS },
  });
  if (result.status !== 0) throw new Error("書き出しに失敗しました。試用版は前の版のまま動いています");
  return { commit: sha, slot, lock };
}

function startServer(site, slot, codes) {
  return detached(
    process.execPath,
    [NEXT, "start", "--hostname", "127.0.0.1", "--port", String(site.port)],
    {
      cwd: WT,
      env: {
        ...process.env,
        KOEKATA_DIST_DIR: slot,
        KOEKATA_ALLOWED_ORIGINS: ORIGINS,
        KOEKATA_ACCESS_CODE: codes[site.audience],
        KOEKATA_TRIAL_AUDIENCE: site.audience,
        KOEKATA_TRIAL_TEAMS_AS: TEAMS_AS[site.audience],
        KOEKATA_DB_PATH: site.db,
        KOEKATA_GRAPH_DIR: DATA,
        KOEKATA_NOTICE_ALWAYS: "1",
      },
    },
    `${site.audience}.log`,
  );
}

async function swapServers(state, slot) {
  const servers = {};
  for (const site of SITES) {
    kill(state.servers?.[site.audience]);
    // 前の形（同じ作業ツリーから動かしていたころ）のサーバーが、同じ番号を使っていれば止める
    for (const pid of state.pids ?? []) kill(pid);
    servers[site.audience] = startServer(site, slot, state.codes);
  }
  for (const site of SITES) {
    let ok = false;
    for (let i = 0; i < 90 && !ok; i++) {
      ok = await healthy(site.port);
      if (!ok) await sleep(1000);
    }
    if (!ok) throw new Error(`${LABEL[site.audience]}のサーバーが起動しませんでした（${join(LOGS, `${site.audience}.log`)}）`);
  }
  return servers;
}

async function startTunnel(site) {
  const logName = `tunnel-${site.audience}.log`;
  writeFileSync(join(LOGS, logName), "");
  const pid = detached(CLOUDFLARED, ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${site.port}`], {}, logName);
  for (let i = 0; i < 60; i++) {
    const found = readFileSync(join(LOGS, logName), "utf8").match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (found) return { pid, url: found[0] };
    await sleep(1000);
  }
  return { pid, url: null };
}

function stopAll() {
  const state = readState();
  for (const pid of state.pids ?? []) kill(pid);
  for (const pid of Object.values(state.servers ?? {})) kill(pid);
  for (const pid of Object.values(state.tunnels ?? {})) kill(pid);
  writeState({ ...state, pids: [], servers: {}, tunnels: {}, urls: {} });
  console.log("試用版を止めました");
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "stop") return stopAll();
  // キーなどを、開発の作業ツリーから Next と同じ読み方で読む（中身は出さない）
  nextEnv.loadEnvConfig(ROOT, false, { info: () => {}, error: console.error });

  const state = readState();
  if (!usable(state.codes)) state.codes = { student: newCode(), teacher: newCode() };
  while (state.codes.student === state.codes.teacher) state.codes.teacher = newCode();

  const at = args.indexOf("--update");
  if (at >= 0) {
    const commit = args[at + 1];
    if (!commit) throw new Error("入れ替えるコミットを指定してください（例：npm run trial -- --update main）");
    const prepared = prepare(commit, state);
    state.servers = await swapServers(state, prepared.slot);
    Object.assign(state, prepared, { pids: [] });
    writeState(state);
    console.log("サーバーを入れ替えました");
  } else if (!SITES.every((site) => alive(state.servers?.[site.audience]))) {
    const built = state.commit && state.slot && existsSync(join(WT, state.slot, "BUILD_ID"));
    const prepared = built ? { commit: state.commit, slot: state.slot, lock: state.lock } : prepare(state.commit ?? "HEAD", state);
    state.servers = await swapServers(state, prepared.slot);
    Object.assign(state, prepared, { pids: [] });
    writeState(state);
  }

  if (!SITES.every((site) => alive(state.tunnels?.[site.audience]))) {
    for (const pid of Object.values(state.tunnels ?? {})) kill(pid);
    state.tunnels = {};
    state.urls = {};
    for (const site of SITES) {
      const { pid, url } = await startTunnel(site);
      state.tunnels[site.audience] = pid;
      state.urls[site.audience] = url;
    }
    console.log("トンネルを開きました。URL が新しくなりました");
  } else {
    console.log("トンネルはそのままです。URL は変わりません");
  }
  writeState(state);
  console.log(`版：${state.commit.slice(0, 7)}`);
  for (const site of SITES) console.log(`${LABEL[site.audience]}：${state.urls[site.audience] ?? "（URL を読めませんでした）"}`);
  console.log(`合言葉と URL は ${STATE} にあります`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
