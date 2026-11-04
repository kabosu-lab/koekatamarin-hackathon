// 本物の Managed Agents で夕方のまとめを1回試す入口。料金がかかるので、テストからは呼ばない。材料は架空。
import { createEveningAgent } from "../src/lib/claude/evening-agent";

const activity = [
  "投稿：ロボットのアーム、3回失敗したけどやっと動いた！🤖 めっちゃ嬉しい🎉",
  "返信：撮る前に、30秒の場面を紙に6枚書くと撮り直しが減りました。去年は半分の時間で終わりました🎉",
  "ありがとう：小テストの作り方を教えてもらって助かりました",
  "勉強：25分の勉強を最後まで続けた",
];

async function main() {
  const agent = createEveningAgent();
  if (!agent) {
    console.error("係を使えません。.env のキーと、npm run setup:evening を確かめてください。");
    process.exit(1);
  }
  const started = Date.now();
  const { items, usage } = await agent.summarize(activity);
  console.log("項目:", items);
  console.log("使った量:", usage);
  console.log("かかった時間（秒）:", Math.round((Date.now() - started) / 1000));
}

main().catch((error: unknown) => {
  console.error("動きませんでした", error instanceof Error ? `${error.name}: ${error.message}` : "unknown");
  process.exit(1);
});
