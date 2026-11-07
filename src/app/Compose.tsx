"use client";

import type { TeamsDelivery } from "@/lib/destination/teams-bridge";
import { Icon } from "./Icon";
import { Fragment, type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Draft, Review } from "@/lib/claude/compose";
import type { AttachmentNotice, AttachmentNoticeKind, AttachmentView } from "@/lib/attachment";
import type { ChannelView, PersonView, PostScope } from "@/lib/destination/types";
import { cardKind, joinSubject, kindOfTag, MAX_SUBJECT_LENGTH, nextTag, splitSubject, tagForKind } from "@/lib/subject";
import { scatterPetals } from "./petals";
import { AttachmentPreview } from "./AttachmentPreview";
import "./compose.css";

export type ComposeStart = {
  draft: Draft;
  /** 本文が書き終わってから届く（0-2l）。届くまでは null */
  review: Review | null;
  /** 0-2l：本文を流しながら書いている間 true。書き終わるまで送れない */
  writing?: boolean;
  /** 本文はできたが、受け取られ方を確かめられなかった。確かめ直しのボタンを出す */
  reviewFailed?: boolean;
  /** 送れなかった下書きを戻すときの、見える範囲 */
  scope?: PostScope;
  scopePersonId?: string;
  channels: ChannelView[];
  people: PersonView[];
  /** card：0-3d のサンクスカードの宛名（札をふつうの種類に回すと、宛名は外れる） */
  asked?: { id: string; name: string; card?: boolean };
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
  /**
   * 0-2l(2)：あれば、押した瞬間にこれを呼んで終わる（送信は呼んだ側が裏で進める）。
   * なければ今までどおり、送り終えてから onSent を呼ぶ
   */
  onSendStart?(send: ComposeSend): void;
};

/** 押した瞬間に渡す、送る中身 */
export type ComposeSend = {
  channel: ChannelView;
  words: string;
  isPublic: boolean;
  /** 送る言葉で確かめた受け取られ方 */
  review: Review | null;
  /** /api/publish に送る中身 */
  body: Record<string, unknown>;
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
  writing = false,
  reviewFailed = false,
  scope: firstScope,
  scopePersonId: firstScopePersonId,
  viewer,
  onCancel,
  onReplaceAttachment,
  onSent,
  onSendStart,
}: Props) {
  const [acknowledged, setAcknowledged] = useState(false);
  const noticesOpen = (attachment?.notices.length ?? 0) > 0 && !acknowledged;
  // 0-2l：書いている間は流れてくる本文をそのまま見せ、本人が直したらその言葉を使う
  const [edited, setEdited] = useState<string | null>(null);
  const text = writing ? draft.text : (edited ?? draft.text);
  const setText = setEdited;
  // 0-3b：件名も本文と同じく、本人が直したらその言葉を使う。札は押すと次の種類に回る
  const [editedSubject, setSubject] = useState<string | null>(null);
  const subject = writing ? draft.subject : (editedSubject ?? draft.subject);
  const subjectParts = splitSubject(subject);
  const subjectTag = subjectParts.tag ?? tagForKind(draft.kind);
  const [editingTitle, setEditingTitle] = useState(false);
  // 0-3d：サンクスカードは札で見分ける。カードの札から外したら、宛名を外してふつうの投稿に戻す
  const card = cardKind(subject);
  const recipient = asked && (!asked.card || card) ? asked : undefined;
  // 送り先は、本人が選ぶまでは下書きの送り先。まだ決まっていなければ出さない
  const [pickedChannel, setChannelId] = useState<string | null>(null);
  // カードからふつうの投稿に戻したら、「ありがとう」チャネルの代わりに全員が読む話題のチャネル
  const backFromCard = asked?.card && !cardKind(writing ? draft.subject : (editedSubject ?? draft.subject)) && draft.channelId === "thanks";
  const channelId =
    pickedChannel ??
    (backFromCard ? (channels.find((c) => c.id !== "thanks" && c.id !== "notices" && c.audience === "everyone")?.id ?? draft.channelId) : draft.channelId);
  // 受け取られ方は、本人が確かめ直すまでは最初に届いたもの
  const [rechecked, setRechecked] = useState<{ review: Review; text: string } | null>(null);
  const current = rechecked ?? (firstReview ? { review: firstReview, text: draft.text } : null);
  const review = current?.review ?? null;
  const reviewedText = current?.text ?? "";
  const setReview = (next: Review, target: string) => setRechecked({ review: next, text: target });
  // 0-1n：3秒たっても本文が出はじめないときは、何をしているかを一言
  const [slow, setSlow] = useState(false);
  const waitingFirstWords = writing && draft.text === "";
  useEffect(() => {
    if (!waitingFirstWords) return;
    const timer = window.setTimeout(() => setSlow(true), 3000);
    return () => window.clearTimeout(timer);
  }, [waitingFirstWords]);
  const [scope, setScope] = useState<PostScope>(firstScope ?? "everyone");
  const [scopePersonId, setScopePersonId] = useState(firstScopePersonId ?? "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // 本文は中身に合わせて伸ばし、途中で切らない（0-1d・0-1o）。
  // 閉じたシートの中で高さが 0 のときは測らず、見えたときに測り直す。
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const fit = () => {
      if (body.getClientRects().length === 0) return;
      body.style.height = "auto";
      // border-box なので、上下のふちの太さを足す（レトロはふちが太い）
      body.style.height = `${body.scrollHeight + body.offsetHeight - body.clientHeight}px`;
    };
    fit();
    if (typeof ResizeObserver === "undefined") return;
    let width = body.clientWidth;
    const observer = new ResizeObserver(() => {
      if (body.clientWidth === width) return;
      width = body.clientWidth;
      fit();
    });
    observer.observe(body);
    return () => observer.disconnect();
  }, [text, writing]);

  const channel: ChannelView | undefined = channels.find((c) => c.id === channelId);
  // 0-2k：送り先を誰が見るのかを、数と一文で見せる。肩書きが学年から始まる人は生徒（ダミーの決まり）
  const isStudent = (label: string) => /^[0-9０-９]年/.test(label);
  const staffCount = people.filter((person) => !isStudent(person.label)).length + (isStudent(viewer.label) ? 0 : 1);
  const studentCount = people.filter((person) => isStudent(person.label)).length + (isStudent(viewer.label) ? 1 : 0);
  const audienceLine =
    scope !== "everyone" || !channel
      ? null
      : channel.audience === "staff"
        ? `${channel.name}：先生 ${staffCount}人が見ます。生徒には見えません`
        : `${channel.name}：先生 ${staffCount}人と生徒 ${studentCount}人が見ます`;
  const checked = !writing && review !== null && text.trim() === reviewedText.trim();
  const blocked = checked && review?.verdict === "block";
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
      setReview(data.review as Review, target);
    } catch {
      setNotice("確かめられませんでした。もう一度押してください。");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!channel) return;
    const sentSubject = subjectParts.title ? joinSubject(subjectTag, subjectParts.title) : "";
    const body = {
      subject: sentSubject || undefined,
      text,
      channelId,
      kind: sentSubject ? kindOfTag(subjectTag) : draft.kind,
      researchedWithAi: draft.researchedWithAi,
      announcement: draft.announcement === true,
      askedPersonId: recipient?.id,
      goalId,
      scope,
      scopePersonId: scope === "person" ? scopePersonId : undefined,
      attachmentId: attachment?.id,
    };
    // 0-3d：カードを送るときは、ふつうの光に加えて花びらが舞う
    if (card) scatterPetals();
    // 0-2l(2)：押した瞬間に送ったあとの動きを始め、送信は呼んだ側が裏で進める
    if (onSendStart) {
      onSendStart({ channel, words: text, isPublic: scope === "everyone", review, body });
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const { ok, status, data } = await postJson("/api/publish", body);
      if (ok) {
        onSent(channel, data.postId as string, text, scope === "everyone", data.teams as TeamsDelivery | undefined);
        return;
      }
      if (status === 422 && data.review) {
        setReview(data.review as Review, text);
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
    <section className="compose-card compose-sheet" aria-label="言葉にして送る" data-card={card ?? undefined}>
      <h2>こんな言葉でどうかな？</h2>
      <div className="preview">
        <p className="preview-title">
          Teams にはこう見えます{channel ? `（${channel.name}）` : ""}。{writing ? "パートナーが書いています" : "文章はここで直せます"}
        </p>
        {(!writing || subject) && (
          // 0-3b：Teams の件名。札を押すと次の種類、言葉を押すと直せる
          <div className="preview-subject">
            <button
              type="button"
              className="preview-subject-tag"
              // 名前に札の言葉を入れない（「ありがとう」などのほかのボタンと取り違えないように）。今の札は見える文字と title で
              aria-label="種類を替える"
              title="押すと次の種類に替わります"
              data-tag={subjectTag}
              disabled={writing}
              onClick={() => setSubject(joinSubject(nextTag(subjectTag), subjectParts.title))}
            >
              【{subjectTag}】
            </button>
            {editingTitle && !writing ? (
              <input
                className="preview-subject-input"
                aria-label="件名"
                autoFocus
                maxLength={MAX_SUBJECT_LENGTH}
                value={subjectParts.title}
                onChange={(event) => setSubject(joinSubject(subjectTag, event.target.value))}
                onBlur={() => setEditingTitle(false)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === "Escape") {
                    event.preventDefault();
                    setEditingTitle(false);
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className="preview-subject-title"
                aria-label="件名を直す"
                title="押すと直せます"
                disabled={writing}
                onClick={() => setEditingTitle(true)}
              >
                <strong>{subjectParts.title || "件名を付ける"}</strong>
              </button>
            )}
          </div>
        )}
        <p className="preview-author">
          <strong>{viewer.name}</strong> {viewer.label}
        </p>
        {recipient && <p className="preview-asked">{recipient.name}さんへ</p>}
        <textarea
          ref={bodyRef}
          className="preview-body compose-body"
          aria-label="投稿の文章"
          rows={2}
          maxLength={MAX_LENGTH}
          value={text}
          onChange={(event) => setText(event.target.value)}
          readOnly={writing}
          hidden={writing}
        />
        {writing && (
          // 0-2l：本文は流れてくるそばから1文字ずつ入り、カーソルが点滅する。書き終わったら直せる欄に替わる
          <p className="preview-body compose-writing" aria-hidden="true">
            {text}
            <span className="compose-caret" />
          </p>
        )}
        {writing && <span className="visually-hidden" role="status">下書きを書いています</span>}
        {attachment && <p className="preview-mark">添付：{attachment.fileName}</p>}
        {draft.researchedWithAi && <p className="preview-mark">AI と調べました</p>}
        {scopeNote && <p className="preview-scope">{scopeNote}</p>}
      </div>

      {writing ? (
        waitingFirstWords && slow && <small className="compose-slow">話したことから、投稿の下書きを作っています…</small>
      ) : !review && !reviewFailed ? (
        <p className="perception waiting" role="status">
          受け取られ方を確かめています…
        </p>
      ) : checked && review ? (
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
        <>
        {!review && (
          <p className="perception waiting compose-review-failed" role="status">
            受け取られ方をまだ確かめられていません。下のボタンで確かめてから送れます。
          </p>
        )}
        <button type="button" disabled={busy || text.trim() === ""} onClick={() => void check(text)}>
          受け取られ方を確かめる
        </button>
        </>
      )}

      {!writing && attachment && (
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
            <p>パートナーが気づいた点はありませんでした。</p>
          )}
          <p className="attachment-caveat">パートナーは見逃すことがあります。最後に確かめるのはあなたです。</p>
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

      {!writing && (
      <ChipGroup
        label="送り先のチャネル"
        value={channelId}
        options={[...channels]
          .sort((a, b) => Number(a.audience === "everyone") - Number(b.audience === "everyone"))
          .map((c) => ({
            value: c.id,
            label: c.name,
            // 先生だけの段と、生徒も見る段に分ける。生徒が使うときは、先生だけのチャネルはもともと出てこない
            group: c.audience === "staff" ? "先生だけ" : "生徒も見る",
            mark: c.audience === "staff" ? "🔒" : "👥",
            count: c.audience === "staff" ? staffCount : staffCount + studentCount,
          }))}
        onChange={setChannelId}
      />
      )}

      {!writing && !recipient && (
        <ChipGroup
          label="見える範囲"
          value={scope}
          options={SCOPE_OPTIONS}
          onChange={(value) => setScope(value as PostScope)}
        />
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

      <div className="compose-actions compose-sheet-actions">
        {/* 0-2k(3)：誰が見るかの一文は、送るボタンと一緒にいつも下に見える */}
        {!writing && audienceLine && (
          <p className="compose-audience" role="status">
            {audienceLine}
          </p>
        )}
        <button type="button" className="secondary" disabled={busy} onClick={onCancel}>
          <Icon name="cancel" />
          取り消す
        </button>
        <button type="button" disabled={busy || writing || !checked || blocked || missingPerson || noticesOpen || !channel} onClick={() => void send()}>
          <Icon name="send" />
          本人として送る
        </button>
      </div>
    </section>
  );
}

/** 小さな選択の箱のかわりに、押しやすい札で1つ選ぶ。矢印キーでも動かせる。 */
function ChipGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  /** group：段の見出し（同じ見出しの続きは1つの段にまとめる）。mark と count：札の印と人数 */
  options: { value: string; label: string; group?: string; mark?: string; count?: number }[];
  onChange(value: string): void;
}) {
  function move(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (step === 0 || options.length === 0) return;
    event.preventDefault();
    const index = Math.max(
      0,
      options.findIndex((option) => option.value === value),
    );
    const next = options[(index + step + options.length) % options.length];
    onChange(next.value);
    const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=radio]");
    buttons[(index + step + options.length) % options.length]?.focus();
  }

  return (
    <div className="compose-chip-field">
      <p className="compose-chip-label" aria-hidden="true">
        {label}
      </p>
      <div className="compose-chips" role="radiogroup" aria-label={label} onKeyDown={move}>
        {options.map((option, index) => {
          const checked = option.value === value;
          const focusable = checked || (index === 0 && !options.some((o) => o.value === value));
          const heading = option.group && option.group !== options[index - 1]?.group ? option.group : null;
          return (
            <Fragment key={option.value}>
            {heading && (
              <span className="compose-chip-group" aria-hidden="true">
                {heading}
              </span>
            )}
            <button
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={focusable ? 0 : -1}
              className="compose-chip"
              onClick={() => onChange(option.value)}
            >
              {option.mark && (
                <span className="compose-chip-mark" aria-hidden="true">
                  {option.mark}
                </span>
              )}
              {option.label}
              {option.count !== undefined && <span className="compose-chip-count">（{option.count}人）</span>}
            </button>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
