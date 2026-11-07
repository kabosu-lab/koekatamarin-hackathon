"use client";

import { playReachedSound } from "@/app/sound";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { CheerHint, TodayCard } from "@/lib/today";
import { Avatar } from "../Avatar";
import { PersonTitle } from "../PersonTitle";
import { ThanksEntry } from "../thanks/ThanksCard";
import { thanksEntryLabel } from "@/lib/thanks-kind";
import { CardReply } from "./CardReply";
import { cardAttr, PostSubject } from "@/app/PostSubject";
import "./today.css";
import { batchOf, markAnswered, nextBatchLabel, TODAY_BATCH, todayDoneLine, useAnswered, useHeldOrder, useSwipeAway } from "./answered";

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ok: response.ok, data: (await response.json().catch(() => ({}))) as Record<string, unknown> };
}

/**
 * カードは1枚ずつ。押さないと次は出ず、自動で流れ続けない。
 * 0-3p：カードは横にシュッと払うと消える。返信・ありがとうをしたら、それだけで消える。いいねは押したあとに払えば消える。
 * 3人とも応えたら「おしまい」と、次のおすすめがあれば「次のおすすめを見る（N件）」。
 */
export function TodayCards({
  cards: incoming,
  polite = false,
}: {
  cards: (TodayCard & { authorImage: string; authorTitle: string | null })[];
  polite?: boolean;
}) {
  const { answered, phase, answer, dismiss } = useAnswered();
  const allCards = useHeldOrder(incoming);
  const [batches, setBatches] = useState(1);
  const { shown: cards, done, rest } = batchOf(allCards, batches, answered);
  const [index, setIndex] = useState(0);
  const at = Math.min(index, cards.length);
  const [cheered, setCheered] = useState<string[]>([]);
  const [hints, setHints] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState("");
  const asked = useRef(new Set<number>());

  const card = cards[at];
  const swipe = useSwipeAway((direction) => {
    if (card) dismiss(card.postId, direction);
  });

  // 今の束のカードのきっかけを、まとめて1回だけ頼む
  useEffect(() => {
    if (asked.current.has(batches)) return;
    asked.current.add(batches);
    const postIds = allCards.slice((batches - 1) * TODAY_BATCH, batches * TODAY_BATCH).map((c) => c.postId);
    if (postIds.length === 0) return;
    void postJson("/api/today/hints", { postIds })
      .then(({ ok, data }) => {
        if (!ok) return;
        const list = (data.hints ?? []) as CheerHint[];
        setHints((current) => ({ ...current, ...Object.fromEntries(list.map((h) => [h.postId, h.hint])) }));
      })
      .catch(() => {
        // きっかけは無くても応援できる
      });
  }, [allCards, batches]);

  const shownId = card?.postId;
  useEffect(() => {
    if (!shownId) return;
    void postJson("/api/today/seen", { postId: shownId }).catch(() => {
      // 見た記録が残らなくても、応援は続けられる
    });
  }, [shownId]);

  // 0-2l：押した瞬間に応援済みの形と音。送信は裏で、届かなかったら戻して知らせる
  async function sendCheer(postId: string) {
    setProblem("");
    setCheered((current) => [...current, postId]);
    playReachedSound();
    const { ok } = await postJson("/api/today/cheer", { postId }).catch(() => ({ ok: false }));
    if (ok) return;
    setCheered((current) => current.filter((id) => id !== postId));
    setProblem("応援を届けられませんでした。もう一度押してください。");
  }

  const next = () => {
    setBatches((value) => value + 1);
    setIndex(0);
  };

  if (allCards.length === 0) {
    return <p className="seen-note">今見られる投稿はまだありません。</p>;
  }

  if (!card) {
    return (
      <section className="talk today-card" aria-label={done ? "おしまい" : "今日はここまで"}>
        <p className="words">{done ? todayDoneLine(polite) : "今日はここまで。見てくれてありがとう！"}</p>
        {rest > 0 && (
          <button type="button" className="secondary" onClick={next}>
            {nextBatchLabel(rest)}
          </button>
        )}
      </section>
    );
  }

  const isCheered = card.likedByViewer || cheered.includes(card.postId);
  const answerPhase = phase[card.postId];

  return (
    <section
      key={card.postId}
      className="talk today-card"
      {...cardAttr(card.subject)}
      aria-label={`${card.authorName}さんの投稿`}
      // 横の指はカードが受ける（払うと消える）。画面の移動には使わない
      data-noswipe
      data-answer={answerPhase}
      {...swipe}
    >
      <p className="count">
        {at + 1} 枚目（全 {cards.length} 枚）・{card.channelName}
      </p>
      <p className="who">
        <Avatar image={card.authorImage} alt={`${card.authorName}さんのパートナー`} size={40} />
        <strong>{card.authorName}</strong> <PersonTitle title={card.authorTitle} />（{card.authorLabel}）
      </p>
      {card.relatedReason && <p className="count related-line">おすすめ：{card.relatedReason}</p>}
      <PostSubject subject={card.subject} />
      <p className="words">{card.body}</p>
      {card.researchedWithAi && <p className="count">AI と調べました</p>}
      {hints[card.postId] && <p className="hint-line">{hints[card.postId]}</p>}
      <div className="row">
        <button type="button" disabled={isCheered} onClick={() => void sendCheer(card.postId)}>
          {isCheered ? "応援しました" : "応援する"}
        </button>
        <button type="button" className="secondary" onClick={() => setIndex(at + 1)}>
          次へ
        </button>
      </div>
      {problem && (
        <p className="notice" role="alert">
          {problem}
        </p>
      )}
      <CardReply key={card.postId} postId={card.postId} onSent={() => answer(card.postId)} />
      {thanksEntryLabel(card.kind) && (
        // ありがとうは話す画面へ移るので、押した時点で応えたことにする（戻ったときに出さない）
        <span className="today-card-thanks" onClickCapture={() => markAnswered(card.postId)}>
          <ThanksEntry key={`thanks-${card.postId}`} person={{ id: card.authorId, name: card.authorName, label: card.authorLabel }} label={thanksEntryLabel(card.kind)!} />
        </span>
      )}
      <Link href={`/teams?channel=${card.channelId}`}>校内チャネルで見る</Link>
      <p className="today-swipe-hint">横に払うと、このカードを閉じます</p>
    </section>
  );
}
