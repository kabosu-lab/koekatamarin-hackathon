import { ComposeError, draftPost, type Draft, type Review, reviewPost } from "./claude/compose";
import { isMessage, MAX_HISTORY } from "./claude/converse-request";
import type { ClaudeClient, ChatMessage } from "./claude/types";
import {
  DestinationError,
  MAX_BODY_LENGTH,
  POST_SCOPES,
  type ChannelView,
  type PersonView,
  type PostDestination,
} from "./destination/types";
import type { PostKind } from "./seed-data";

type Failure = { status: 400 | 422 | 503; body: { error: string; review?: Review } };

export type DraftOutcome =
  | { status: 200; body: { draft: Draft; review: Review | null; channels: ChannelView[]; people: PersonView[] } }
  | Failure;
export type ReviewOutcome = { status: 200; body: { review: Review } } | Failure;
export type PublishOutcome = { status: 200; body: { postId: string; channelId: string } } | Failure;

const UNAVAILABLE: Failure = { status: 503, body: { error: "相棒につながりませんでした" } };
const KINDS: readonly PostKind[] = ["trouble", "worry", "effort", "report"];

function fields(input: unknown): Record<string, unknown> {
  return typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
}

function validText(text: unknown): text is string {
  return typeof text === "string" && text.trim() !== "" && text.length <= MAX_BODY_LENGTH;
}

function logFailure(error: unknown) {
  // 話の中身をログに残さない
  console.error("言葉にする処理に失敗", error instanceof Error ? error.name : "unknown");
}

export async function handleDraft(
  claude: ClaudeClient,
  destination: PostDestination,
  viewerId: string,
  input: unknown,
): Promise<DraftOutcome> {
  const { history, askedPersonId } = fields(input);
  if (askedPersonId !== undefined && typeof askedPersonId !== "string") {
    return { status: 400, body: { error: "聞く相手が正しくありません" } };
  }
  if (
    !Array.isArray(history) ||
    history.length === 0 ||
    history.length > MAX_HISTORY ||
    !history.every(isMessage)
  ) {
    return { status: 400, body: { error: "会話の記録が正しくありません" } };
  }

  try {
    let channels = destination.listChannels(viewerId);
    let askedName: string | undefined;
    if (askedPersonId !== undefined) {
      const name = destination.findPersonName(askedPersonId);
      if (!name || askedPersonId === viewerId) return { status: 400, body: { error: "聞く相手が正しくありません" } };
      askedName = name;
      // 相手が読めるチャネルだけを送り先にする
      const theirs = new Set(destination.listChannels(askedPersonId).map((c) => c.id));
      channels = channels.filter((c) => theirs.has(c.id));
    }
    const draft = await draftPost(claude, history as ChatMessage[], channels, askedName);
    const review = draft.ready ? await reviewPost(claude, draft.text) : null;
    return { status: 200, body: { draft, review, channels, people: destination.listOtherPeople(viewerId) } };
  } catch (error) {
    logFailure(error);
    return UNAVAILABLE;
  }
}

/** 送った直後の取り消し。 */
export function handleUndo(destination: PostDestination, viewerId: string, input: unknown, now: Date = new Date()) {
  const { postId } = fields(input);
  if (typeof postId !== "string" || !destination.undoPost(viewerId, postId, now)) {
    return { status: 409, body: { error: "もう取り消せません" } };
  }
  return { status: 200, body: { ok: true } };
}

export async function handleReview(claude: ClaudeClient, input: unknown): Promise<ReviewOutcome> {
  const { text } = fields(input);
  if (!validText(text)) return { status: 400, body: { error: "本文が空か、長すぎます" } };

  try {
    return { status: 200, body: { review: await reviewPost(claude, text) } };
  } catch (error) {
    logFailure(error);
    return UNAVAILABLE;
  }
}

/** 本人が送るときの最後の関門。画面の確認を通らない依頼でも、個人攻撃はここで止める。 */
export async function handlePublish(
  claude: ClaudeClient,
  destination: PostDestination,
  viewerId: string,
  input: unknown,
): Promise<PublishOutcome> {
  const { text, channelId, kind, researchedWithAi, askedPersonId, scope, scopePersonId } = fields(input);
  const knownScope = POST_SCOPES.find((s) => s === scope);
  if (scope !== undefined && !knownScope) return { status: 400, body: { error: "見える範囲が正しくありません" } };
  if (scopePersonId !== undefined && typeof scopePersonId !== "string") {
    return { status: 400, body: { error: "見せる相手が正しくありません" } };
  }
  if (askedPersonId !== undefined && typeof askedPersonId !== "string") {
    return { status: 400, body: { error: "聞く相手が正しくありません" } };
  }
  if (!validText(text)) return { status: 400, body: { error: "本文が空か、長すぎます" } };
  if (typeof channelId !== "string") return { status: 400, body: { error: "チャネルが正しくありません" } };

  // 確かめられないときは送らない
  let review: Review;
  try {
    review = await reviewPost(claude, text);
  } catch (error) {
    if (!(error instanceof ComposeError)) logFailure(error);
    return { status: 503, body: { error: "確認ができなかったので、まだ送っていません" } };
  }
  if (review.verdict === "block") {
    return { status: 422, body: { error: "この内容は送れません", review } };
  }

  try {
    const postId = destination.createPost(viewerId, channelId, text, {
      kind: KINDS.find((k) => k === kind),
      researchedWithAi: researchedWithAi === true,
      askedPersonId,
      scope: knownScope,
      scopePersonId,
    });
    return { status: 200, body: { postId, channelId } };
  } catch (error) {
    if (error instanceof DestinationError) return { status: 400, body: { error: error.message } };
    throw error;
  }
}

