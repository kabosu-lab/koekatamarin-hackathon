// 本物の Claude で「校内の知恵」の下書きと検索を試す入口。料金がかかるので、テストからは呼ばない。
import { createClaude } from "../src/lib/claude/index";
import { openDatabase } from "../src/lib/db";
import { createDummyTeams } from "../src/lib/destination/dummy-teams";
import { draftKnowledge, handleKnowledgeFind, loadMaterial } from "../src/lib/knowledge";
import { seedDatabase } from "../src/lib/seed";

async function main() {
  const claude = createClaude();
  if (claude.mode !== "real") {
    console.error("本物の Claude につながりません。.env に ANTHROPIC_API_KEY を入れてください。");
    process.exit(1);
  }
  const db = openDatabase(":memory:");
  seedDatabase(db);
  const teams = createDummyTeams(db);

  // 手順の入ったやり取りから作る。経験や数字が足されていないかを読む
  const material = loadMaterial(db, teams, "kawamura", "post-making-2");
  if (!material) throw new Error("材料がありません");
  console.log(`=== 下書きの材料\n${material.post.body}\n${material.replies.map((r) => `${r.authorName}：${r.body}`).join("\n")}`);
  console.log("=== 下書き", await draftKnowledge(claude, material));

  const query = "文化祭の動画を作りたいんだけど、毎回時間がかかりそうで。";
  console.log(`\n=== 検索：${query}`);
  const { body } = await handleKnowledgeFind(claude, db, teams, "fujimoto", { query });
  console.log(JSON.stringify((body.results as { key: string; reason: string }[]).map((r) => [r.key, r.reason]), null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.name : error);
  process.exit(1);
});
