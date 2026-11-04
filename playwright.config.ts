import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const TRIAL_PORT = 3101;

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
        KOEKATA_DB_PATH: join(tmpdir(), `koekata-e2e-${process.pid}.db`),
        // .env にキーがあっても、テストでは料金を使わない
        KOEKATA_CLAUDE: "scripted",
        KOEKATA_NOTICE_ALWAYS: "1",
      },
    },
    {
      // 上のビルドが終わるのを待ってから、同じビルドを合言葉つきで動かす
      command: `until curl -sf http://127.0.0.1:${PORT}/api/health > /dev/null; do sleep 1; done; npm run start -- --hostname 127.0.0.1 --port ${TRIAL_PORT}`,
      url: `http://127.0.0.1:${TRIAL_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 240_000,
      env: {
        KOEKATA_DB_PATH: join(tmpdir(), `koekata-e2e-trial-${process.pid}.db`),
        KOEKATA_CLAUDE: "scripted",
        KOEKATA_ACCESS_CODE: "test-code",
        KOEKATA_ALLOWED_ORIGINS: "*.trycloudflare.com",
      },
    },
  ],
});
