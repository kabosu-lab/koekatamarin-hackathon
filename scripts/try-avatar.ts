// 本物の Claude で、ダミーの写真から相棒を選ぶ。料金がかかるので、テストからは呼ばない。
//   npm run try:avatar
import { pickWithClaude } from "../src/lib/avatar-art";
import { createClaude } from "../src/lib/claude/index";
import { drawBicycle, drawDrink, drawMug, drawNightCity } from "../src/lib/profile-photo/dummy";

const cases = [
  { name: "夕焼け色のマグカップ", draw: drawMug },
  { name: "青い自転車", draw: drawBicycle },
  { name: "桜色の飲み物", draw: drawDrink },
  { name: "夜の街", draw: drawNightCity },
];

async function main() {
  const claude = createClaude();
  if (claude.mode !== "real") {
    console.error("本物の Claude につながりません。.env に ANTHROPIC_API_KEY を入れてください。");
    process.exit(1);
  }
  for (const { name, draw } of cases) {
    const attachment = { mediaType: "image/png" as const, base64: Buffer.from(draw()).toString("base64") };
    const pick = await pickWithClaude(claude, { attachment, seed: name });
    console.log(`\n${name}：`, pick ?? "選べませんでした");
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
