// 本物の Claude で「人につなぐ」を試す入口。料金がかかるので、テストからは呼ばない。
import { createClaude } from "../src/lib/claude/index";
import type { ChatMessage } from "../src/lib/claude/types";
import { buildDirectory, suggestPerson } from "../src/lib/connect";
import { openDatabase } from "../src/lib/db";
import { createDummyTeams } from "../src/lib/destination/dummy-teams";
import { seedDatabase } from "../src/lib/seed";

function chat(...lines: string[]): ChatMessage[] {
  return lines.map((content, index) => ({ role: index % 2 === 0 ? "user" : "assistant", content }));
}

const cases: [string, ChatMessage[]][] = [
  ["話の途中", chat("保護者から電話があってな", "そうなんや、どんな電話やったん？", "席替えのことで文句言われて", "それはびっくりするな。何て言われたん？")],
  ["煮詰まった", chat("保護者から席替えのことで文句言われて", "どう返そうと思ってる？", "わからん", "どのへんが一番悩ましい？", "もう考えても同じとこぐるぐるしてるわ")],
  ["解決した", chat("アプリで作文集めるやり方わからんくて", "どこで止まってる？", "提出ボタンの場所", "画面の右上を見てみて", "あった！できたわ、ありがとう")],
  ["人を嫌がっている", chat("保護者対応しんどいわ", "そっか、しんどいな", "人には言いたくないねん", "うん、ここでだけ話してくれてええよ", "もう考えても同じとこぐるぐるしてるわ")],
];

async function main() {
  const claude = createClaude();
  if (claude.mode !== "real") {
    console.error("本物の Claude につながりません。.env に ANTHROPIC_API_KEY を入れてください。");
    process.exit(1);
  }
  const db = openDatabase(":memory:");
  seedDatabase(db);
  const directory = buildDirectory(db, createDummyTeams(db), "saeki");

  for (const [name, history] of cases) {
    const result = await suggestPerson(claude, history, directory, new Date("2026-11-04T01:00:00Z"));
    console.log(`\n=== ${name}\n`, result ?? "声をかけない");
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.name : error);
  process.exit(1);
});
