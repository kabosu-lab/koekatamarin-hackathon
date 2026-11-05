// Teams へのサインイン（1回だけ）。表示された URL を開いてコードを入れる。トークンは画面に出さない。
import { readGraphConfig, startDeviceLogin } from "../src/lib/graph/auth";

async function main() {
  const config = readGraphConfig();
  if (!config) throw new Error("data/teams.json がありません");
  const login = await startDeviceLogin(config);
  console.log(`開く URL：${login.verificationUri}`);
  console.log(`コード：${login.userCode}`);
  console.log(`有効な時間：${Math.round(login.expiresIn / 60)} 分`);
  await login.poll();
  console.log("サインインできました");
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
