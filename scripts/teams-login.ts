// Teams へのサインイン（1回だけ）。表示された URL を開いてコードを入れる。トークンは画面に出さない。
// npx tsx scripts/teams-login.ts saeki のように人物を付けると、その人として投稿できるようになる。
// 人物を付けないと、読み取り用のサインインになる。
import { getAccessToken, linkPerson, readGraphConfig, startDeviceLogin } from "../src/lib/graph/auth";

async function main() {
  const personId = process.argv[2];
  if (personId && !/^[a-z]+$/.test(personId)) throw new Error("人物の ID が正しくありません");
  const config = readGraphConfig();
  if (!config) throw new Error("data/teams.json がありません");
  const login = await startDeviceLogin(config, fetch, undefined, personId);
  console.log(`開く URL：${login.verificationUri}`);
  console.log(`コード：${login.userCode}`);
  console.log(`有効な時間：${Math.round(login.expiresIn / 60)} 分`);
  await login.poll();
  const token = await getAccessToken(fetch, Date.now(), personId);
  const me = (await (await fetch("https://graph.microsoft.com/v1.0/me?$select=id,displayName", { headers: { Authorization: `Bearer ${token}` } })).json()) as { id: string; displayName: string };
  if (personId) linkPerson(me.id, personId);
  console.log(`サインインできました：${me.displayName}${personId ? `（${personId} として）` : "（読み取り用）"}`);
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
