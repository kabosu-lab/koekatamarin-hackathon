// 開発の足跡を、デモの Teams の「開発の足跡」チームに1件だけ投稿する。テストは「テストの結果」、push は「できたこと」へ。
//   npx tsx scripts/dev-log.ts test <テストの出力のファイル>   scripts/test.sh が通ったとき（件数を拾う）
//   npx tsx scripts/dev-log.ts push                            push したあと
// 設定（data/teams.json）やサインインがなければ、黙って飛ばす。失敗しても終わりの値は 0（テストを落とさない）。
// 撮影用のチーム（teams.json の team）には出さない。名前は teams.json の devLog で変えられる。トークンと ID は画面に出さない。
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { getAccessToken, readGraphConfig } from "../src/lib/graph/auth";
import { countsFromOutput, devLogMessage } from "../src/lib/dev-log";

const GRAPH = "https://graph.microsoft.com/v1.0";
const DEFAULTS = { team: "開発の足跡", test: "テストの結果", push: "できたこと" };
const TIMEOUT_MS = 10_000;

const git = (...args: string[]) => {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};

function readLog(path: string | undefined): string {
  try {
    return path ? readFileSync(path, "utf8") : "";
  } catch {
    return "";
  }
}

async function main() {
  const [kind, logFile] = process.argv.slice(2);
  if (kind !== "test" && kind !== "push") return;
  if (process.env.KOEKATA_DEV_LOG === "off") return;
  const config = readGraphConfig() as (ReturnType<typeof readGraphConfig> & { devLog?: Partial<typeof DEFAULTS> }) | null;
  if (!config) return;
  const names = { ...DEFAULTS, ...config.devLog };
  const channelName = names[kind];
  if (names.team === config.team) return;
  const token = await getAccessToken();
  if (!token) return;

  const call = async (path: string, init?: RequestInit) => {
    const response = await fetch(`${GRAPH}${path}`, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
    if (!response.ok) throw new Error(`Teams が ${response.status} を返しました`);
    return (await response.json()) as { value: { id: string; displayName: string }[] };
  };
  const team = (await call("/me/joinedTeams")).value.find((item) => item.displayName === names.team);
  if (!team) return;
  const channel = (await call(`/teams/${team.id}/channels`)).value.find((item) => item.displayName === channelName);
  if (!channel) {
    console.log(`「${channelName}」のチャネルがないので、足跡は送りませんでした`);
    return;
  }
  const content = devLogMessage({
    kind,
    ...countsFromOutput(readLog(logFile)),
    commit: git("log", "-1", "--format=%h %s"),
  });
  await call(`/teams/${team.id}/channels/${encodeURIComponent(channel.id)}/messages`, {
    method: "POST",
    body: JSON.stringify({ body: { contentType: "text", content } }),
  });
  console.log("開発の足跡を Teams に残しました");
}

main().catch((error: unknown) => {
  // 足跡は付け足しなので、失敗してもテストや push を止めない。中身は出さない
  console.log("開発の足跡を送れませんでした", error instanceof Error ? error.name : "");
});
