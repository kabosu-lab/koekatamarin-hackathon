// 本物の Claude でパートナーの話し方を試す入口。料金がかかるので、テストからは呼ばない。
//   npm run try:voice                   最初の一言3つを試す
//   npm run try:voice -- "試したい言葉"  その言葉も足して試す
import { createClaude } from "../src/lib/claude/index";
import { converse } from "../src/lib/claude/converse";
import { openingLines } from "../src/lib/claude/persona";

async function main() {
  const claude = createClaude();
  if (claude.mode !== "real") {
    console.error("本物の Claude につながりません。.env に ANTHROPIC_API_KEY を入れてください。");
    process.exit(1);
  }

  for (const line of [...openingLines, ...process.argv.slice(2)]) {
    const { reply, refused } = await converse(claude, [], line);
    console.log(`\n話す：${line}\nパートナー：${reply}${refused ? "（安全のため断られました）" : ""}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
