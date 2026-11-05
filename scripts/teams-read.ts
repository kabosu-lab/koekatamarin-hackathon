// デモ用チャネルを読むだけ（投稿しない）。投稿者と時刻、本文の先頭を出す。トークンと ID は画面に出さない。
import { getAccessToken, readGraphConfig } from "../src/lib/graph/auth";

const GRAPH = "https://graph.microsoft.com/v1.0";
type Message = {
  createdDateTime: string;
  from: { user?: { displayName?: string }; application?: { displayName?: string } } | null;
  body: { content: string };
  replies?: Message[];
};

async function main() {
  const config = readGraphConfig();
  const token = await getAccessToken();
  if (!config?.team || !config.channel || !token) throw new Error("設定かサインインがありません");
  const call = async <T>(path: string): Promise<T> => {
    const response = await fetch(`${GRAPH}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`読み取りに失敗：${response.status}`);
    return (await response.json()) as T;
  };
  const { value: teams } = await call<{ value: { id: string; displayName: string }[] }>("/me/joinedTeams");
  const team = teams.find((item) => item.displayName === config.team);
  if (!team) throw new Error("チームが見つかりません");
  const { value: channels } = await call<{ value: { id: string; displayName: string }[] }>(`/teams/${team.id}/channels`);
  const channel = channels.find((item) => item.displayName === config.channel);
  if (!channel) throw new Error("チャネルが見つかりません");
  const { value: messages } = await call<{ value: Message[] }>(`/teams/${team.id}/channels/${encodeURIComponent(channel.id)}/messages?$top=10&$expand=replies`);
  const who = (message: Message) => message.from?.user?.displayName ?? message.from?.application?.displayName ?? "（なし）";
  const text = (message: Message) => message.body.content.replace(/<[^>]+>/g, "").slice(0, 40);
  console.log("件数：", messages.length);
  for (const message of messages) {
    console.log(message.createdDateTime, who(message), text(message), "返信", message.replies?.length ?? 0);
    for (const reply of message.replies ?? []) console.log("  └", reply.createdDateTime, who(reply), text(reply));
  }
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
