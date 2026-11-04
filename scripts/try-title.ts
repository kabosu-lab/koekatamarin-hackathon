// 本物の Claude で、肩書きの案を試す。料金がかかるので、テストからは呼ばない。
//   npm run try:title
import { createClaude } from "../src/lib/claude/index";
import { suggestTitles } from "../src/lib/titles";

const words = ["撮る前に、30秒の場面を紙に6枚書くと撮り直しが減りました。去年は半分の時間で終わりました🎉", "図書室のしおり立てを 3D プリンターで試作しました", "次の空き時間に一緒に一度やってみましょうか😊"];

async function main() {
  const claude = createClaude();
  if (claude.mode !== "real") {
    console.error("本物の Claude につながりません。.env に ANTHROPIC_API_KEY を入れてください。");
    process.exit(1);
  }
  console.log(await suggestTitles(claude, words));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
