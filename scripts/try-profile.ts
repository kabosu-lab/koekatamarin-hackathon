// 本物の Claude でプロフィールの下書きを試す入口。料金がかかるので、テストからは呼ばない。
import { createClaude } from "../src/lib/claude/index";
import { openDatabase } from "../src/lib/db";
import { createDummyTeams } from "../src/lib/destination/dummy-teams";
import { getDraft, handleProfile } from "../src/lib/profile";
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

  await handleProfile(claude, db, teams, "noda", { action: "draft" });
  console.log("下書き：", getDraft(db, "noda"));
  await handleProfile(claude, db, teams, "noda", { action: "revise", request: "全国大会で優勝した経験も書いて" });
  console.log("事実を足す頼みのあと：", getDraft(db, "noda"));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.name : error);
  process.exit(1);
});
