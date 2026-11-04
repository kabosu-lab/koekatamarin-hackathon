// 本物の Claude で、ダミーの写真から相棒を選び、進化の候補を出す。料金がかかるので、テストからは呼ばない。
//   npm run try:avatar
import { chooseAvatar } from "../src/lib/avatar";
import { pickWithClaude } from "../src/lib/avatar-art";
import { evolutionCandidates } from "../src/lib/avatar-evolve";
import { createClaude } from "../src/lib/claude/index";
import { openDatabase } from "../src/lib/db";
import { drawBicycle, drawDrink, drawMug, drawNightCity } from "../src/lib/profile-photo/dummy";
import { seedDatabase } from "../src/lib/seed";

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
  if (!process.argv.includes("--evolve-only")) {
    for (const { name, draw } of cases) {
      const attachment = { mediaType: "image/png" as const, base64: Buffer.from(draw()).toString("base64") };
      const pick = await pickWithClaude(claude, { attachment, seed: name });
      console.log(`\n${name}：`, pick ?? "選べませんでした");
    }
  }

  const db = openDatabase(":memory:");
  seedDatabase(db);
  db.prepare("DELETE FROM avatars WHERE person_id = 'saeki'").run();
  chooseAvatar(db, "saeki", "human", "listen");
  const insert = db.prepare("INSERT INTO thanks (id, from_person_id, to_person_id, message, created_at) VALUES (?, 'aoki', 'saeki', 'ありがとう', ?)");
  for (let i = 0; i < 30; i++) insert.run(`try-${i}`, new Date().toISOString());
  console.log("\n進化の候補：", await evolutionCandidates(claude, db, "saeki"));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
