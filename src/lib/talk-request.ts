import type { DatabaseSync } from "node:sqlite";
import { handleConverse, parseConverseInput } from "./claude/converse-request";
import type { ClaudeClient } from "./claude/types";
import { getDestination } from "./destination/current";
import { saveTalkFeedback } from "./feedback";
import { goalsForPrompt } from "./goals";
import { memoryForPrompt } from "./memory";
import { schoolPostsForPrompt } from "./school-posts-prompt";
import { assessSafety, assessWithoutClaude, createSafetyNotice, type SafetyNoticeBody } from "./safety";

export type { SafetyNoticeBody };

/** 話している人が生徒か先生か。生徒には勉強の答えをすぐ言わないために、パートナーに渡す。名前は渡さない */
export function speakerForPrompt(db: DatabaseSync, viewerId: string): string {
  const row = db.prepare("SELECT role FROM people WHERE id = ?").get(viewerId) as { role?: string } | undefined;
  if (!row?.role) return "";
  return `話している人：${row.role === "student" ? "生徒" : "先生"}`;
}

/** パートナーの返事と、命や安全の確認を同時に進める。確認に失敗しても会話は止めず、はっきりした言葉は見逃さない。 */
export async function handleTalk(
  claude: ClaudeClient,
  db: DatabaseSync,
  viewerId: string,
  input: unknown,
  now: Date = new Date(),
  /** 依頼に画面の場所がないとき（歩きながら など）に使う、開いていた画面の道 */
  fallbackPath?: string,
) {
  const parsed = parseConverseInput(input);
  const [outcome, assessment] = await Promise.all([
    handleConverse(
      claude,
      input,
      parsed
        ? [speakerForPrompt(db, viewerId), memoryForPrompt(db, getDestination(db), viewerId), goalsForPrompt(db, viewerId), schoolPostsForPrompt(getDestination(db), viewerId, [...parsed.history.filter((m) => m.role === "user").map((m) => m.content), parsed.text].join(" "))]
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

  // 0-3l (2)：本人が届けることに同意した感想は、この呼び出しの中で残す。名前も人物も残さない。
  // 命や安全の案内が出たときは預からない。同じ言葉は二重に残さない
  let feedbackSaved: true | undefined;
  if (outcome.status === 200 && outcome.deliver && !safety) {
    const { path, screenWidth } = input as Record<string, unknown>;
    try {
      if (saveTalkFeedback(db, { body: outcome.deliver, path: path ?? fallbackPath, screenWidth }, now)) feedbackSaved = true;
    } catch (error) {
      console.error("話の中の感想を残せませんでした", error instanceof Error ? error.name : "unknown");
    }
  }

  // 返事が作れなくても、相談室に伝えたことは本人に知らせる
  return { status: outcome.status, body: { ...outcome.body, safety, ...(feedbackSaved ? { feedbackSaved } : {}) } };
}
