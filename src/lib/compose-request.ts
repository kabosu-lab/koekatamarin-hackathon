import { markCelebrated } from "./goals";
import type { DatabaseSync } from "node:sqlite";
import {
  type AttachmentNotice,
  type AttachmentView,
  draftFromAttachment,
  linkAttachment,
  loadPending,
  toClaudeAttachment,
} from "./attachment";
import { ComposeError, draftPost, type Draft, type Review, reviewPost, streamDraft } from "./claude/compose";
import { dripText } from "./claude/scripted";
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
import { noteAlternatives, noteDraftNotReady, notePublished, noteUndone } from "./trophy-log";

type Failure = { status: 400 | 422 | 503; body: { error: string; review?: Review } };

export type DraftOutcome =
  | {
      status: 200;
      body: {
        draft: Draft;
        review: Review | null;
        channels: ChannelView[];
        people: PersonView[];
        attachment?: AttachmentView & { notices: AttachmentNotice[] };
      };
    }
  | Failure;
export type ReviewOutcome = { status: 200; body: { review: Review } } | Failure;
export type PublishOutcome = { status: 200; body: { postId: string; channelId: string } } | Failure;

const UNAVAILABLE: Failure = { status: 503, body: { error: "パートナーにつながりませんでした" } };
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

/** トロフィーのための操作の記録。下書きができなかった（パートナーが聞き返した）ことと、言い換えの案だけを残す。 */
function noteDraftOutcome(db: DatabaseSync | undefined, viewerId: string, review: Review | null): void {
  if (!db) return;
  const now = new Date();
  if (review) noteAlternatives(db, viewerId, review.alternatives, now);
  else noteDraftNotReady(db, viewerId, now);
}

type DraftPlan = {
  history: ChatMessage[];
  channels: ChannelView[];
  people: PersonView[];
  askedName?: string;
  stored: ReturnType<typeof loadPending> | null;
};

/** 下書きを作る前の確かめと、Claude を呼ばずに決まるもの（送り先・人・添付）。 */
function planDraft(destination: PostDestination, viewerId: string, input: unknown, db?: DatabaseSync): DraftPlan | Failure {
  const { history, askedPersonId, attachmentId } = fields(input);
  if (attachmentId !== undefined && typeof attachmentId !== "string") {
    return { status: 400, body: { error: "添付が正しくありません" } };
  }
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
  let stored: DraftPlan["stored"] = null;
  if (attachmentId !== undefined) {
    stored = db ? loadPending(db, viewerId, attachmentId) : null;
    if (!stored) return { status: 400, body: { error: "添付が見つかりません。もう一度付けてください" } };
  }
  return { history: history as ChatMessage[], channels, people: destination.listOtherPeople(viewerId), askedName, stored };
}

/** 0-2l：流れる下書きの知らせ。1つずつ1行の JSON にして送る。 */
export type DraftStreamEvent =
  | { type: "start"; channels: ChannelView[]; people: PersonView[]; attachment?: AttachmentView & { notices: AttachmentNotice[] } }
  | { type: "channel"; channelId: string }
  | { type: "delta"; text: string }
  | { type: "draft"; draft: Draft; notices?: AttachmentNotice[] }
  | { type: "review"; review: Review | null }
  | { type: "error"; error: string };

/**
 * 0-2l：下書きを流しながら作る。確かめで止まったときは Failure を返し、流さない。
 * 流れは start（送り先と人）→ channel・delta（本文の続き）→ draft → review の順。失敗は error。
 */
export function prepareDraftStream(
  claude: ClaudeClient,
  destination: PostDestination,
  viewerId: string,
  input: unknown,
  db?: DatabaseSync,
): Failure | { status: 200; run(send: (event: DraftStreamEvent) => void): Promise<void> } {
  let plan: DraftPlan | Failure;
  try {
    plan = planDraft(destination, viewerId, input, db);
  } catch (error) {
    logFailure(error);
    return UNAVAILABLE;
  }
  if ("status" in plan) return plan;
  const { history, channels, people, askedName, stored } = plan;
  return {
    status: 200,
    async run(send) {
      const attachment = stored ? { id: stored.id, mediaType: stored.media_type, fileName: stored.file_name, notices: [] } : undefined;
      send({ type: "start", channels, people, ...(attachment ? { attachment } : {}) });
      try {
        let draft: Draft;
        let notices: AttachmentNotice[] | undefined;
        if (stored) {
          // 添付の下書きは流せないので、できてから決まった速さで少しずつ渡す
          const result = await draftFromAttachment(claude, toClaudeAttachment(stored), history, channels);
          draft = result.draft;
          notices = result.notices;
          if (draft.ready) {
            send({ type: "channel", channelId: draft.channelId });
            await dripText(draft.text, (text) => send({ type: "delta", text }));
          }
        } else {
          draft = await streamDraft(
            claude,
            history,
            channels,
            { text: (text) => send({ type: "delta", text }), channel: (channelId) => send({ type: "channel", channelId }) },
            askedName,
          );
        }
        send({ type: "draft", draft, ...(notices ? { notices } : {}) });
        const review = draft.ready ? await reviewPost(claude, draft.text) : null;
        noteDraftOutcome(db, viewerId, review);
        send({ type: "review", review });
      } catch (error) {
        logFailure(error);
        send({ type: "error", error: UNAVAILABLE.body.error });
      }
    },
  };
}

export async function handleDraft(
  claude: ClaudeClient,
  destination: PostDestination,
  viewerId: string,
  input: unknown,
  db?: DatabaseSync,
): Promise<DraftOutcome> {
  try {
    const plan = planDraft(destination, viewerId, input, db);
    if ("status" in plan) return plan;
    const { history, channels, askedName, stored } = plan;
    if (stored) {
      const { draft, notices } = await draftFromAttachment(claude, toClaudeAttachment(stored), history, channels);
      const review = draft.ready ? await reviewPost(claude, draft.text) : null;
      noteDraftOutcome(db, viewerId, review);
      return {
        status: 200,
        body: {
          draft,
          review,
          channels,
          people: destination.listOtherPeople(viewerId),
          attachment: { id: stored.id, mediaType: stored.media_type, fileName: stored.file_name, notices },
        },
      };
    }
    const draft = await draftPost(claude, history as ChatMessage[], channels, askedName);
    const review = draft.ready ? await reviewPost(claude, draft.text) : null;
    noteDraftOutcome(db, viewerId, review);
    return { status: 200, body: { draft, review, channels, people: destination.listOtherPeople(viewerId) } };
  } catch (error) {
    logFailure(error);
    return UNAVAILABLE;
  }
}

/** 送った直後の取り消し。 */
export function handleUndo(destination: PostDestination, viewerId: string, input: unknown, now: Date = new Date(), db?: DatabaseSync) {
  const { postId } = fields(input);
  if (typeof postId !== "string" || !destination.undoPost(viewerId, postId, now)) {
    return { status: 409, body: { error: "もう取り消せません" } };
  }
  if (db) noteUndone(db, viewerId, now);
  return { status: 200, body: { ok: true } };
}

export async function handleReview(claude: ClaudeClient, input: unknown, db?: DatabaseSync, viewerId?: string): Promise<ReviewOutcome> {
  const { text } = fields(input);
  if (!validText(text)) return { status: 400, body: { error: "本文が空か、長すぎます" } };

  try {
    const review = await reviewPost(claude, text);
    if (db && viewerId) noteAlternatives(db, viewerId, review.alternatives, new Date());
    return { status: 200, body: { review } };
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
  db?: DatabaseSync,
): Promise<PublishOutcome> {
  const { announcement, goalId, text, channelId, kind, researchedWithAi, askedPersonId, scope, scopePersonId, attachmentId } = fields(input);
  if (attachmentId !== undefined && (typeof attachmentId !== "string" || !db || !loadPending(db, viewerId, attachmentId))) {
    return { status: 400, body: { error: "添付が見つかりません。もう一度付けてください" } };
  }
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
      announcement: announcement === true,
      askedPersonId,
      scope: knownScope,
      scopePersonId,
      needsLook: review.verdict === "caution",
    });
    if (typeof attachmentId === "string" && db) linkAttachment(db, viewerId, attachmentId, postId);
    if (db) {
      markCelebrated(db, viewerId, goalId, postId, new Date());
      notePublished(db, viewerId, { text, askedPersonId }, new Date());
    }
    return { status: 200, body: { postId, channelId } };
  } catch (error) {
    if (error instanceof DestinationError) return { status: 400, body: { error: error.message } };
    throw error;
  }
}

