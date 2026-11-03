import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: true,
  reporter: "list",
  use: { baseURL: `http://127.0.0.1:${PORT}` },
  projects: [{ name: "スマホ", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: `npm run build && npm run start -- --hostname 127.0.0.1 --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    // テストの記録を手元のデータと混ぜず、毎回まっさらから始める
    env: { KOEKATA_DB_PATH: join(tmpdir(), `koekata-e2e-${process.pid}.db`) },
  },
});
