import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    testTimeout: 30_000,
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // data/ に設定があっても、テストから本物の Teams へ送らない
    env: { KOEKATA_TEAMS: "off", KOEKATA_GRAPH_DIR: "no-graph-in-tests", KOEKATA_TEAMS_WEBHOOK_URL: "" },
  },
});
