import type { DatabaseSync } from "node:sqlite";
import { handleConverse, parseConverseInput } from "./claude/converse-request";
import type { ClaudeClient } from "./claude/types";
import { assessSafety, isCounselingOpen, listShareCandidates, recordAlert, type ShareCandidate } from "./safety";

export type SafetyNoticeBody = {
  alertId: string;
  counselingOpen: boolean;
  candidates: ShareCandidate[];
};

/** 相棒の返事と、命や安全の確認を同時に進める。確認の失敗で会話は止めない。 */
export async function handleTalk(
  claude: ClaudeClient,
  db: DatabaseSync,
  viewerId: string,
  input: unknown,
  now: Date = new Date(),
) {
  const parsed = parseConverseInput(input);
  const [outcome, assessment] = await Promise.all([
    handleConverse(claude, input),
    parsed
      ? assessSafety(claude, parsed.history, parsed.text).catch((error: unknown) => {
          // 話の中身をログに残さない
          console.error("命や安全の確認に失敗", error instanceof Error ? error.name : "unknown");
          return null;
        })
      : null,
  ]);

  let safety: SafetyNoticeBody | undefined;
  if (assessment?.concern) {
    safety = {
      alertId: recordAlert(db, viewerId, assessment.summary, now),
      counselingOpen: isCounselingOpen(now),
      candidates: listShareCandidates(db, viewerId),
    };
  }

  // 返事が作れなくても、相談室に伝えたことは本人に知らせる
  return { status: outcome.status, body: { ...outcome.body, safety } };
}
