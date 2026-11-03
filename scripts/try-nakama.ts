// 本物の Claude で「仲間を探す」を試す入口。料金がかかるので、テストからは呼ばない。
import { createClaude } from "../src/lib/claude/index";
import { buildPublicEntries } from "../src/lib/connect";
import { openDatabase } from "../src/lib/db";
import { createDummyTeams } from "../src/lib/destination/dummy-teams";
import { suggestNakama } from "../src/lib/nakama";
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

  for (const viewerId of ["aoki", "nakamura", "saeki"]) {
    const entries = buildPublicEntries(db, teams, viewerId);
    const self = entries.find((entry) => entry.id === viewerId);
    if (!self) continue;
    console.log(`\n=== ${self.name}（${self.label}）\nプロフィール：${self.publicProfile}\n言葉：${self.publicWords.join(" / ")}`);
    const others = entries.filter((entry) => entry.id !== viewerId);
    for (const found of await suggestNakama(claude, self, others)) {
      const entry = others.find((other) => other.id === found.personId);
      console.log(`\n→ ${found.name}（${found.label}）\n  理由：${found.reason}\n  材料：${entry?.publicProfile} / ${entry?.publicWords.join(" / ")}`);
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.name : error);
  process.exit(1);
});
