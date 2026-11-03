// 本物の Claude でふりかえりを試す入口。料金がかかるので、テストからは呼ばない。
import { createClaude } from "../src/lib/claude/index";
import { openDatabase } from "../src/lib/db";
import { collectMaterial, periodStart, writeLookback } from "../src/lib/lookback";
import { seedDatabase } from "../src/lib/seed";

async function main() {
  const claude = createClaude();
  if (claude.mode !== "real") {
    console.error("本物の Claude につながりません。.env に ANTHROPIC_API_KEY を入れてください。");
    process.exit(1);
  }
  const db = openDatabase(":memory:");
  seedDatabase(db);
  for (const person of ["saeki", "aoki"]) {
    const material = collectMaterial(db, person, periodStart("year", new Date()));
    console.log(`\n=== ${person}\n`, (await writeLookback(claude, material)).text);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.name : error);
  process.exit(1);
});
