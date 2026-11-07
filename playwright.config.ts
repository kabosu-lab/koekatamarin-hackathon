import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { PROMISE_SEEN } from "./e2e/promise-seen";

// 並べて作る担当が同時に動かせるよう、番号は外から変えられる（KOEKATA_E2E_PORT。試用はその次の番号）
const PORT = Number(process.env.KOEKATA_E2E_PORT ?? 3100);
const TRIAL_PORT = PORT + 1;
// 試用のサーバーの記録。話の中の感想が残ったかを、画面テスト（e2e/feedback.spec.ts）から読んで確かめる。
// 子の worker にも同じ道が渡るよう、環境変数に置く
const TRIAL_DB = process.env.KOEKATA_E2E_TRIAL_DB ?? join(tmpdir(), `koekata-e2e-trial-${process.pid}.db`);
process.env.KOEKATA_E2E_TRIAL_DB = TRIAL_DB;

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: true,
  // 他のアプリでメモリが埋まっている Mac でも、時間切れで偽の失敗を出さない
  workers: 3,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  // デモの通し確認の写真（e2e/demo.spec.ts）を、成功しても残す
  preserveOutput: "always",
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // 既存の画面テストは分身のいるポップで見る。モダン（初期）は e2e/modern.spec.ts で確かめる
    storageState: {
      cookies: [
        {
          name: "koekata_theme",
          value: "pop",
          domain: "127.0.0.1",
          path: "/",
          expires: -1,
          httpOnly: false,
          secure: false,
          sameSite: "Lax",
        },
        // 最初の約束のカードは読んだことにしておく（e2e/promise-seen.ts）
        ...PROMISE_SEEN,
      ],
      origins: [],
    },
  },
  projects: [
    { name: "スマホ", testIgnore: "trial.spec.ts", use: { ...devices["Pixel 7"] } },
    {
      name: "試用",
      testMatch: "trial.spec.ts",
      use: {
        ...devices["Pixel 7"],
        baseURL: `http://127.0.0.1:${TRIAL_PORT}`,
      },
    },
  ],
  webServer: [
    {
      command: `npm run build && npm run start -- --hostname 127.0.0.1 --port ${PORT}`,
      url: `http://127.0.0.1:${PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 180_000,
      // テストの記録を手元のデータと混ぜず、毎回まっさらから始める
      env: {
        // data/ に設定があっても、テストから本物の Teams へ送らない
        KOEKATA_TEAMS: "off",
        KOEKATA_GRAPH_DIR: join(tmpdir(), "koekata-e2e-no-graph"),
        KOEKATA_TEAMS_WEBHOOK_URL: "",
        KOEKATA_DB_PATH: join(tmpdir(), `koekata-e2e-${process.pid}.db`),
        // .env にキーがあっても、テストでは料金を使わない
        KOEKATA_CLAUDE: "scripted",
        KOEKATA_NOTICE_ALWAYS: "1",
      },
    },
    {
      // 上のビルドが終わるのを待ってから、同じビルドを合言葉つきで動かす
      // 待つ処理は Mac と Windows のどちらのシェルでも動くよう、node で書く
      command: `node -e "const wait=()=>fetch('http://127.0.0.1:${PORT}/api/health').then(r=>{if(!r.ok)throw 0}).catch(()=>new Promise(s=>setTimeout(s,1000)).then(wait));wait()" && npm run start -- --hostname 127.0.0.1 --port ${TRIAL_PORT}`,
      url: `http://127.0.0.1:${TRIAL_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 240_000,
      env: {
        // data/ に設定があっても、テストから本物の Teams へ送らない
        KOEKATA_TEAMS: "off",
        KOEKATA_GRAPH_DIR: join(tmpdir(), "koekata-e2e-no-graph"),
        KOEKATA_TEAMS_WEBHOOK_URL: "",
        KOEKATA_DB_PATH: TRIAL_DB,
        KOEKATA_CLAUDE: "scripted",
        KOEKATA_ACCESS_CODE: "test-code",
        KOEKATA_ALLOWED_ORIGINS: "*.trycloudflare.com",
      },
    },
  ],
});
