// サインインした人が入っているチームとチャネルの名前を並べる。data/teams.json の対応表を書くときに使う。ID とトークンは出さない。
import { getAccessToken, readGraphConfig } from "../src/lib/graph/auth";

const GRAPH = "https://graph.microsoft.com/v1.0";

async function main() {
  const config = readGraphConfig();
  const token = await getAccessToken(fetch, Date.now(), process.argv[2]);
  if (!config || !token) throw new Error("設定かサインインがありません");
  const get = async (path: string) => {
    const response = await fetch(`${GRAPH}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Teams が ${response.status} を返しました`);
    return ((await response.json()) as { value: { id: string; displayName: string }[] }).value;
  };
  for (const team of await get("/me/joinedTeams")) {
    const channels = await get(`/teams/${team.id}/channels`);
    console.log(`${team.displayName}：${channels.map((channel) => channel.displayName).join("、")}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
