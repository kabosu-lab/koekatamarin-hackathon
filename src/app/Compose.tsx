"use client";

import type { TeamsDelivery } from "@/lib/destination/teams-bridge";
import { Icon } from "./Icon";
import { useState } from "react";
import type { Draft, Review } from "@/lib/claude/compose";
import type { AttachmentNotice, AttachmentNoticeKind, AttachmentView } from "@/lib/attachment";
import type { ChannelView, PersonView, PostScope } from "@/lib/destination/types";
import { AttachmentPreview } from "./AttachmentPreview";

export type ComposeStart = {
  draft: Draft;
  review: Review;
  channels: ChannelView[];
  people: PersonView[];
  asked?: { id: string; name: string };
  /** 頑張りたいことを乗り越えた投稿のとき */
  goalId?: string;
  attachment?: AttachmentView & { notices: AttachmentNotice[] };
};

type Props = ComposeStart & {
  viewer: { name: string; label: string };
  onCancel(): void;
  /** 添付を付け直すために、話す画面へ戻る */
  onReplaceAttachment?(): void;
  onSent(channel: ChannelView, postId: string, words: string, isPublic: boolean, teams?: TeamsDelivery): void;
};

const SCOPE_OPTIONS: { value: PostScope; label: string }[] = [
  { value: "everyone", label: "チャネルのみんな" },
  { value: "person", label: "特定の人だけ" },
  { value: "managers", label: "管理職や担任だけ" },
  { value: "self", label: "自分だけ" },
];

const MAX_LENGTH = 2000;

const NOTICE_LABEL: Record<AttachmentNoticeKind, string> = {
  name: "名前",
  face: "顔",
  contact: "連絡先",
  address: "住所",
  student_number: "学籍番号",
  other: "個人の情報",
};

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ok: response.ok, status: response.status, data: (await response.json()) as Record<string, unknown> };
}

export function Compose({
  draft,
  review: firstReview,
  channels,
  people,
  asked,
  goalId,
  attachment,
  viewer,
  onCancel,
  onReplaceAttachment,
  onSent,
}: Props) {
  const [acknowledged, setAcknowledged] = useState(false);
  const noticesOpen = (attachment?.notices.length ?? 0) > 0 && !acknowledged;
  const [text, setText] = useState(draft.text);
  const [channelId, setChannelId] = useState(draft.channelId);
  const [review, setReview] = useState(firstReview);
  const [reviewedText, setReviewedText] = useState(draft.text);
  const [scope, setScope] = useState<PostScope>("everyone");
  const [scopePersonId, setScopePersonId] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const channel = channels.find((c) => c.id === channelId) ?? channels[0];
  const checked = text.trim() === reviewedText.trim();
  const blocked = checked && review.verdict === "block";
  const missingPerson = scope === "person" && scopePersonId === "";
  const scopeNote =
    scope === "person"
      ? `${people.find((p) => p.id === scopePersonId)?.name ?? "選んだ人"}さんとあなただけに見えます`
      : scope === "managers"
        ? "管理職や担任とあなただけに見えます"
        : scope === "self"
          ? "あなただけに見えます"
          : null;

  async function check(target: string) {
    setBusy(true);
    setNotice("");
    try {
      const { ok, data } = await postJson("/api/review", { text: target });
      if (!ok) throw new Error("review failed");
      setReview(data.review as Review);
      setReviewedText(target);
    } catch {
      setNotice("確かめられませんでした。もう一度押してください。");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    setBusy(true);
    setNotice("");
    try {
      const { ok, status, data } = await postJson("/api/publish", {
        text,
        channelId,
        kind: draft.kind,
        researchedWithAi: draft.researchedWithAi,
        askedPersonId: asked?.id,
        goalId,
        scope,
        scopePersonId: scope === "person" ? scopePersonId : undefined,
        attachmentId: attachment?.id,
      });
      if (ok) {
        onSent(channel, data.postId as string, text, scope === "everyone", data.teams as TeamsDelivery | undefined);
        return;
      }
      if (status === 422 && data.review) {
        setReview(data.review as Review);
        setReviewedText(text);
        return;
      }
      setNotice(
        status === 400 && typeof data.error === "string"
          ? `まだ送っていません。${data.error}`
          : "まだ送っていません。もう一度押してください。",
      );
    } catch {
      setNotice("まだ送っていません。もう一度押してください。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="compose-card" aria-label="言葉にして送る">
      <h2>こんな言葉でどうかな？</h2>
      <div className="preview">
        <p className="preview-title">Teams にはこう見えます（{channel.name}）。文章はここで直せます</p>
        <p className="preview-author">
          <strong>{viewer.name}</strong> {viewer.label}
        </p>
        {asked && <p className="preview-asked">{asked.name}さんへ</p>}
        <textarea
          className="preview-body"
          aria-label="投稿の文章"
          rows={4}
          maxLength={MAX_LENGTH}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        {attachment && <p className="preview-mark">添付：{attachment.fileName}</p>}
        {draft.researchedWithAi && <p className="preview-mark">AI と調べました</p>}
        {scopeNote && <p className="preview-scope">{scopeNote}</p>}
      </div>

      {checked ? (
        <div className={`perception ${review.verdict}`} role="status">
          <p>{review.perception}</p>
          {review.alternatives.map((alternative) => (
            <button
              type="button"
              className="alternative"
              key={alternative}
              disabled={busy}
              onClick={() => {
                setText(alternative);
                void check(alternative);
              }}
            >
              この言い方にする：{alternative}
            </button>
          ))}
        </div>
      ) : (
        <button type="button" disabled={busy || text.trim() === ""} onClick={() => void check(text)}>
          受け取られ方を確かめる
        </button>
      )}

      {attachment && (
        <div className="attachment-check" aria-label="添付の確認" role="group">
          <AttachmentPreview attachment={attachment} />
          {attachment.notices.length > 0 ? (
            <>
              <h3>隠しますか？</h3>
              <ul>
                {attachment.notices.map((notice) => (
                  <li key={`${notice.kind}-${notice.where}`}>
                    {NOTICE_LABEL[notice.kind]}：{notice.where}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>相棒が気づいた点はありませんでした。</p>
          )}
          <p className="attachment-caveat">相棒は見逃すことがあります。最後に確かめるのはあなたです。</p>
          <div className="row">
            {attachment.notices.length > 0 && (
              <button type="button" className="secondary" disabled={busy} onClick={onReplaceAttachment}>
                隠して撮り直す
              </button>
            )}
            <button type="button" className="secondary" disabled={busy} onClick={onReplaceAttachment}>
              別のファイルにする
            </button>
            {attachment.notices.length > 0 && (
              <button type="button" className="secondary" disabled={busy || acknowledged} aria-pressed={acknowledged} onClick={() => setAcknowledged(true)}>
                {acknowledged ? "このまま送ります" : "このまま送る"}
              </button>
            )}
          </div>
        </div>
      )}

      <label className="channel">
        送り先のチャネル
        <select value={channelId} onChange={(event) => setChannelId(event.target.value)}>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      {!asked && (
        <label className="channel">
          見える範囲
          <select value={scope} onChange={(event) => setScope(event.target.value as PostScope)}>
            {SCOPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {scope === "person" && (
        <label className="channel">
          見せる相手
          <select value={scopePersonId} onChange={(event) => setScopePersonId(event.target.value)}>
            <option value="">選んでください</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}（{person.label}）
              </option>
            ))}
          </select>
        </label>
      )}

      {notice && (
        <p className="notice" role="alert">
          {notice}
        </p>
      )}

      <div className="compose-actions">
        <button type="button" className="secondary" disabled={busy} onClick={onCancel}>
          <Icon name="cancel" />
          取り消す
        </button>
        <button type="button" disabled={busy || !checked || blocked || missingPerson || noticesOpen} onClick={() => void send()}>
          <Icon name="send" />
          本人として送る
        </button>
      </div>
    </section>
  );
}
