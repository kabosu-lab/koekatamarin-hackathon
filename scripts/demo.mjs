#!/usr/bin/env node
// キーも Teams もなしで全部の流れを試すための起動。外へは通信せず、料金もかからない。
// ダミーのデータは一時フォルダに置くので、手元の DB を汚さない。
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = process.env.PORT ?? "3000";
const nextBin = join("node_modules", "next", "dist", "bin", "next");
const next = spawn(process.execPath, [nextBin, "dev", "--hostname", "127.0.0.1", "--port", port], {
  stdio: "inherit",
  env: {
    ...process.env,
    KOEKATA_CLAUDE: "scripted",
    KOEKATA_TEAMS: "off",
    KOEKATA_NOTICE_ALWAYS: "1",
    KOEKATA_DB_PATH: join(tmpdir(), `koekata-demo-${Date.now()}.db`),
  },
});
next.on("exit", (code) => process.exit(code ?? 0));
