// 本物の Claude で、添付からの下書きと気づきを試す入口。料金がかかるので、テストからは呼ばない。
//   npm run try:attachment
import { readFileSync } from "node:fs";
import { draftFromAttachment } from "../src/lib/attachment";
import { createClaude } from "../src/lib/claude/index";
import type { ClaudeAttachment } from "../src/lib/claude/types";
import { DEMO_CERTIFICATE, DEMO_REPORT, makeDemoAttachments } from "./make-demo-attachments";

const channels = [
  { id: "making", name: "ものづくり", description: "作ったものや試したこと" },
  { id: "clubs", name: "部活の頑張り", description: "部活や大会の頑張り" },
];

async function main() {
  const claude = createClaude();
  if (claude.mode !== "real") {
    console.error("本物の Claude につながりません。.env に ANTHROPIC_API_KEY を入れてください。");
    process.exit(1);
  }
  await makeDemoAttachments();
  const cases: { path: string; mediaType: ClaudeAttachment["mediaType"]; words: string }[] = [
    { path: DEMO_CERTIFICATE, mediaType: "image/png", words: "これ、ロボットのやつ！めっちゃ嬉しい" },
    { path: DEMO_REPORT, mediaType: "application/pdf", words: "しおり立ての報告書できました" },
  ];
  for (const { path, mediaType, words } of cases) {
    const base64 = readFileSync(path).toString("base64");
    const result = await draftFromAttachment(claude, { mediaType, base64 }, [{ role: "user", content: words }], channels);
    console.log(`\n添付：${path}\n話す：${words}\n下書き：${result.draft.text}\n気づき：`, result.notices);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
