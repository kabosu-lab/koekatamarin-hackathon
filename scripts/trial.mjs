#!/usr/bin/env node
// 学校で数人に触ってもらう試用版を、生徒用と先生用の2つ起動し、それぞれ HTTPS のトンネルで外へ出す。
//   npm run trial            書き出し（初回か --build のとき）、起動、トンネル。URL と合言葉は data/trial.json
//   npm run trial -- --build 書き出しをやり直してから起動
//   npm run trial:stop       止める（夜に必ず止める）
//   npm run trial -- --local 外へ出さず、手元だけで確かめる
//
// 生徒用：本物の Claude（1時間あたりの回数に上限）、話した言葉を覚えさせない、生徒だけを選べる。Teams へは青木の名前で届く。
// 先生用：本物の Claude（.env のキー。1時間あたりの回数に上限）、先生も選べる。
// どちらもダミーのデータで、開発の DB とは別。投稿はデモの閉じたテナントの Teams へ、決めたダミーの名前で届く。
// 合言葉と URL は data/（Git に入らない）にだけ書く。トークンは読まない、出さない。
import { spawn, spawnSync } from "node:child_process";
import { randomInt } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIST = ".next-trial";
const STATE = join("data", "trial.json");
const ORIGINS = "*.trycloudflare.com";
// Teams へ送るときの名前。生徒用は生徒のダミー、先生用は先生のダミー（どちらもサインイン済みのデモの人物）
const TEAMS_AS = { student: process.env.KOEKATA_TRIAL_STUDENT_AS ?? "aoki", teacher: process.env.KOEKATA_TRIAL_TEACHER_AS ?? "saeki" };
const CLOUDFLARED = process.env.CLOUDFLARED ?? (process.platform === "win32" ? "C:\\Program Files (x86)\\cloudflared\\cloudflared.exe" : "cloudflared");
const nextBin = join("node_modules", "next", "dist", "bin", "next");

const SITES = [
  { audience: "student", port: 3201, db: join("data", "trial-students.db"), env: {} },
  { audience: "teacher", port: 3202, db: join("data", "trial-teachers.db"), env: {} },
];

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
  writeFileSync(STATE, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

function stop() {
  const state = readState();
  for (const pid of state.pids ?? []) {
    if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    else {
      try {
        process.kill(pid);
      } catch {
        // もう止まっている
      }
    }
  }
  writeState({ ...state, pids: [], urls: {} });
  console.log("試用版を止めました");
}

function build() {
  console.log("試用版を書き出しています…");
  const result = spawnSync(process.execPath, [nextBin, "build"], {
    stdio: "inherit",
    env: { ...process.env, KOEKATA_DIST_DIR: DIST, KOEKATA_ALLOWED_ORIGINS: ORIGINS },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function tunnel(port, onUrl) {
  const child = spawn(CLOUDFLARED, ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${port}`], { stdio: ["ignore", "pipe", "pipe"] });
  const look = (chunk) => {
    const found = String(chunk).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (found) onUrl(found[0]);
  };
  child.stdout.on("data", look);
  child.stderr.on("data", look);
  return child;
}

function start() {
  if (process.argv.includes("--build") || !existsSync(join(DIST, "BUILD_ID"))) build();
  const state = readState();
  let codes = usable(state.codes) ? state.codes : { student: newCode(), teacher: newCode() };
  while (codes.student === codes.teacher) codes = { ...codes, teacher: newCode() };
  const urls = {};
  const pids = [];
  writeState({ ...state, codes, urls, pids });

  for (const site of SITES) {
    const server = spawn(process.execPath, [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(site.port)], {
      stdio: "inherit",
      env: {
        ...process.env,
        ...site.env,
        KOEKATA_DIST_DIR: DIST,
        KOEKATA_ALLOWED_ORIGINS: ORIGINS,
        KOEKATA_ACCESS_CODE: codes[site.audience],
        KOEKATA_TRIAL_AUDIENCE: site.audience,
        KOEKATA_TRIAL_TEAMS_AS: TEAMS_AS[site.audience],
        KOEKATA_DB_PATH: site.db,
        KOEKATA_NOTICE_ALWAYS: "1",
      },
    });
    pids.push(server.pid);
    server.on("exit", (code) => console.log(`${site.audience} の画面が止まりました（${code}）`));
    if (process.argv.includes("--local")) continue;
    const pipe = tunnel(site.port, (url) => {
      if (urls[site.audience]) return;
      urls[site.audience] = url;
      writeState({ ...readState(), codes, urls, pids });
      console.log(`${site.audience === "student" ? "生徒用" : "先生用"}：${url}`);
    });
    pids.push(pipe.pid);
    pipe.on("exit", (code) => console.log(`${site.audience} のトンネルが止まりました（${code}）`));
  }
  writeState({ ...readState(), codes, pids });
  console.log(`合言葉と URL は ${STATE} にあります`);
}

if (process.argv[2] === "stop") stop();
else start();
