// 本物の Claude で応援のきっかけを試す入口。料金がかかるので、テストからは呼ばない。
import { createClaude } from "../src/lib/claude/index";
import { openDatabase } from "../src/lib/db";
import { createDummyTeams } from "../src/lib/destination/dummy-teams";
import { seedDatabase } from "../src/lib/seed";
import { makeCheerHints } from "../src/lib/today";

async function main() {
  const claude = createClaude();
  if (claude.mode !== "real") {
    console.error("本物の Claude につながりません。.env に ANTHROPIC_API_KEY を入れてください。");
    process.exit(1);
  }
  const db = openDatabase(":memory:");
  seedDatabase(db);
  const teams = createDummyTeams(db);
  console.log(await makeCheerHints(claude, teams, "saeki", ["post-study-1", "post-clubs-1", "post-ask-1"]));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.name : error);
  process.exit(1);
});
