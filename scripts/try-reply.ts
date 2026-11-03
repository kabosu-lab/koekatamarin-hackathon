// 本物の Claude で「話して返す」を試す入口。料金がかかるので、テストからは呼ばない。
import { createClaude } from "../src/lib/claude/index";
import { draftReply } from "../src/lib/inbox";

const request = "作文の感想に、どんな一言を書くと生徒に届くのか悩んでいます。佐伯先生はどうされていますか？";
const cases = [
  "うーん、ようわからんわ",
  "どうしようかな、難しいな",
  "私はな、いいとこ一個だけ書くねん。あとは赤入れへん",
  "昔はいっぱい書いてたけどあかんかったな",
  "はい、経験談を3つ作って書いておいて",
  "詳しくないねん、そういうの",
];

async function main() {
  const claude = createClaude();
  if (claude.mode !== "real") {
    console.error("本物の Claude につながりません。.env に ANTHROPIC_API_KEY を入れてください。");
    process.exit(1);
  }
  for (const spoken of cases) {
    console.log(`\n話した：${spoken}\n結果：`, await draftReply(claude, request, spoken));
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.name : error);
  process.exit(1);
});
