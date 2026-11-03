// 本物の Claude で一日のまとめを試す入口。料金がかかるので、テストからは呼ばない。
import { createClaude } from "../src/lib/claude/index";
import { makeItems } from "../src/lib/daily";

async function main() {
  const claude = createClaude();
  if (claude.mode !== "real") {
    console.error("本物の Claude につながりません。.env に ANTHROPIC_API_KEY を入れてください。");
    process.exit(1);
  }
  const items = await makeItems(
    claude,
    ["返信：私はいいところを一つだけ書いています", "投稿：しおり立て、国語の教室にもほしいです"],
    [
      { role: "user", content: "今日は保護者から電話があってちょっと疲れたわ" },
      { role: "assistant", content: "そら疲れるなあ。どんな電話やったん？" },
      { role: "user", content: "席替えのことやけど、ちゃんと話聞いたら分かってくれはった" },
    ],
  );
  console.log(items);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.name : error);
  process.exit(1);
});
