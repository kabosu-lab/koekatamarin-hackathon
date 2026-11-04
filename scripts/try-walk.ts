// 本物の Claude で、歩きながら話した内容の整理と下書きを試す入口。料金がかかるので、テストからは呼ばない。
import { summarizeWalk } from "../src/lib/walk";
import { createClaude } from "../src/lib/claude/index";

const channels = [
  { id: "study", name: "資格の勉強会", description: "勉強は教えない。一緒に勉強する" },
  { id: "making", name: "ものづくり", description: "作ったものや試作" },
];
const spoken =
  "今日はな、ものづくり部で作ってたしおり立てがやっと倒れんようになってん。なんか底を広くしたら今度は反ってもうてんけど、木下さんが熱い湯につけたら戻るって見つけてくれて。あれはうまく言われへんけど、触った感じでわかるらしいわ。来週は図書室に持っていくつもり。あと小テスト作るのに毎回時間かかるんやけど、みんなどうしてるんやろ";

async function main() {
  const claude = createClaude();
  if (claude.mode !== "real") {
    console.error("本物の Claude につながりません。.env に ANTHROPIC_API_KEY を入れてください。");
    process.exit(1);
  }
  console.log(JSON.stringify(await summarizeWalk(claude, spoken, channels), null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
