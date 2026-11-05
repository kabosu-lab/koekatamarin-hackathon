// 本物の Claude で、頑張りたいことの促し方を読み比べる入口。料金がかかるので、テストからは呼ばない。
import { converse } from "../src/lib/claude/converse";
import { createClaude } from "../src/lib/claude/index";
import { goalPromptText, type Nudge } from "../src/lib/goals";

const scenes: { goals: string[]; line: string }[] = [
  { goals: ["資格の動画を週3本見る"], line: "こんにちは" },
  { goals: ["資格の動画を週3本見る"], line: "動画、今週まだ見れてへん" },
  { goals: ["毎日10分歩く"], line: "今日は特に何もなかったです" },
  { goals: ["毎日10分歩く", "体重を3キロ減らす"], line: "やせたいけど、しんどくて全然動けない" },
  { goals: ["資格の動画を週3本見る"], line: "最近ほんまにつらくて、何もする気が起きひん" },
  { goals: ["資格の動画を週3本見る"], line: "動画3本見た！できた！" },
];

async function main() {
  const claude = createClaude();
  if (claude.mode !== "real") {
    console.error("本物の Claude につながりません。.env に ANTHROPIC_API_KEY を入れてください。");
    process.exit(1);
  }
  for (const nudge of ["gentle", "blunt"] as Nudge[]) {
    for (const { goals, line } of scenes) {
      const { reply } = await converse(claude, [], line, goalPromptText(goals, nudge));
      console.log(`\n[${nudge}] 頑張りたいこと：${goals.join("、")}\n話す：${line}\nパートナー：${reply}`);
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
