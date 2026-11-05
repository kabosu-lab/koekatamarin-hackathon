import type { DatabaseSync } from "node:sqlite";
import { handleConverse, parseConverseInput } from "./claude/converse-request";
import type { ClaudeClient } from "./claude/types";
import { getDestination } from "./destination/current";
import { goalsForPrompt } from "./goals";
import { memoryForPrompt } from "./memory";
import { schoolPostsForPrompt } from "./school-posts-prompt";
import { assessSafety, assessWithoutClaude, createSafetyNotice, type SafetyNoticeBody } from "./safety";

export type { SafetyNoticeBody };

/** 相棒の返事と、命や安全の確認を同時に進める。確認に失敗しても会話は止めず、はっきりした言葉は見逃さない。 */
export async function handleTalk(
  claude: ClaudeClient,
  db: DatabaseSync,
  viewerId: string,
  input: unknown,
  now: Date = new Date(),
) {
  const parsed = parseConverseInput(input);
  const [outcome, assessment] = await Promise.all([
    handleConverse(
      claude,
      input,
      parsed
        ? [memoryForPrompt(db, getDestination(db), viewerId), goalsForPrompt(db, viewerId), schoolPostsForPrompt(getDestination(db), viewerId)]
            .filter(Boolean)
            .join("\n\n")
        : "",
    ),
    parsed
      ? assessSafety(claude, parsed.history, parsed.text).catch((error: unknown) => {
          // 話の中身をログに残さない
          console.error("命や安全の確認に失敗", error instanceof Error ? error.name : "unknown");
          return assessWithoutClaude(parsed.text);
        })
      : null,
  ]);

  const safety: SafetyNoticeBody | undefined = assessment?.concern
    ? createSafetyNotice(db, viewerId, assessment.summary, now)
    : undefined;

  // 返事が作れなくても、相談室に伝えたことは本人に知らせる
  return { status: outcome.status, body: { ...outcome.body, safety } };
}
