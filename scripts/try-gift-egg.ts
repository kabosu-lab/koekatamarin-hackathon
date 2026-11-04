// 本物の Claude で、贈り物の卵から生まれる相棒を選ぶ。料金がかかるので、テストからは呼ばない。
//   npm run try:gift-egg
import { CATALOG } from "../src/lib/avatar-catalog";
import { createClaude } from "../src/lib/claude/index";
import { chooseFromEgg } from "../src/lib/gift-eggs";

const words = ["図書室のしおり立てを 3D プリンターで試作しました", "音楽は最後に決めると、映像に合わせやすかったです", "底を広くしたら安定しました"];

async function main() {
  const claude = createClaude();
  if (claude.mode !== "real") {
    console.error("本物の Claude につながりません。.env に ANTHROPIC_API_KEY を入れてください。");
    process.exit(1);
  }
  console.log(await chooseFromEgg(claude, words, CATALOG));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
