// 本物の Teams への投稿を1回だけ試し、投稿者名と読み取りを確かめる。トークンと ID は画面に出さない。
import { getAccessToken, readGraphConfig } from "../src/lib/graph/auth";

const GRAPH = "https://graph.microsoft.com/v1.0";

async function main() {
  const config = readGraphConfig();
  const token = await getAccessToken();
  if (!config?.team || !config.channel || !token) throw new Error("設定かサインインがありません");
  const call = async (path: string, init?: RequestInit) => {
    const response = await fetch(`${GRAPH}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) throw new Error(`${path.split("?")[0].replace(/[0-9a-f-]{20,}[^/]*/g, "…")}：${response.status} ${JSON.stringify(body.error ?? {}).slice(0, 200)}`);
    return body;
  };

  const me = await call("/me?$select=displayName");
  console.log("サインインした人：", me.displayName);
  const teams = (await call("/me/joinedTeams")).value as { id: string; displayName: string }[];
  const team = teams.find((item) => item.displayName === config.team);
  if (!team) throw new Error("チームが見つかりません");
  const channels = (await call(`/teams/${team.id}/channels`)).value as { id: string; displayName: string }[];
  const channel = channels.find((item) => item.displayName === config.channel);
  if (!channel) throw new Error("チャネルが見つかりません");

  const messages = `/teams/${team.id}/channels/${encodeURIComponent(channel.id)}/messages`;
  const posted = await call(messages, {
    method: "POST",
    body: JSON.stringify({ body: { contentType: "text", content: "こえかたからのテスト投稿です（ダミー）" } }),
  });
  const from = posted.from as { user?: { displayName?: string } } | null;
  console.log("投稿できました。投稿者の表示：", from?.user?.displayName ?? "（名前なし）");

  // 一覧への反映は少し遅れることがあるので、投稿の ID で直接読む
  const read = await call(`${messages}/${posted.id}`);
  console.log("今の投稿を読み取れた：", read.id === posted.id);
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
