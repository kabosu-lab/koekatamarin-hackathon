"use client";

import { playReachedSound } from "@/app/sound";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CheerHint, TodayCard } from "@/lib/today";
import { Avatar } from "../Avatar";
import { PersonTitle } from "../PersonTitle";
import { CardReply } from "./CardReply";

const BATCH = 3;

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ok: response.ok, data: (await response.json().catch(() => ({}))) as Record<string, unknown> };
}

/** カードは1枚ずつ。押さないと次は出ず、自動で流れ続けない。 */
export function TodayCards({ cards: allCards }: { cards: (TodayCard & { authorImage: string; authorTitle: string | null })[] }) {
  const [hiddenAuthors, setHiddenAuthors] = useState<string[]>([]);
  const [hiddenNote, setHiddenNote] = useState("");
  const cards = useMemo(() => allCards.filter((c) => !hiddenAuthors.includes(c.authorId)), [allCards, hiddenAuthors]);
  const [index, setIndex] = useState(0);
  const touchX = useRef<number | null>(null);
  const [limit, setLimit] = useState(BATCH);
  const [cheered, setCheered] = useState<string[]>([]);
  const [hints, setHints] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState("");
  const asked = useRef(new Set<number>());

  const card = cards[index];

  // 今の束のカードのきっかけを、まとめて1回だけ頼む
  useEffect(() => {
    const start = limit - BATCH;
    if (asked.current.has(start)) return;
    asked.current.add(start);
    const postIds = cards.slice(start, limit).map((c) => c.postId);
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
  }, [cards, limit]);

  const shownId = index < limit ? card?.postId : undefined;
  useEffect(() => {
    if (!shownId) return;
    void postJson("/api/today/seen", { postId: shownId }).catch(() => {
      // 見た記録が残らなくても、応援は続けられる
    });
  }, [shownId]);

  async function sendCheer(postId: string) {
    setProblem("");
    const { ok } = await postJson("/api/today/cheer", { postId }).catch(() => ({ ok: false }));
    if (ok) {
      setCheered((current) => [...current, postId]);
      playReachedSound();
    }
    else setProblem("応援を届けられませんでした。もう一度押してください。");
  }

  async function hideAuthor(authorId: string, authorName: string) {
    setProblem("");
    const { ok } = await postJson("/api/hidden", { personId: authorId, hidden: true }).catch(() => ({ ok: false }));
    if (ok) {
      setHiddenAuthors((current) => [...current, authorId]);
      setHiddenNote(`${authorName}さんをしばらく出しません。相手には伝わりません。`);
    } else {
      setProblem("変更できませんでした。もう一度押してください。");
    }
  }

  const note = hiddenNote && (
    <p className="seen-note" role="status">
      {hiddenNote} <Link href="/me">「履歴と設定」から戻せます</Link>
    </p>
  );

  if (cards.length === 0) {
    return (
      <>
        {note}
        <p className="seen-note">今見られる投稿はまだありません。</p>
      </>
    );
  }

  if (index >= limit || !card) {
    return (
      <>
        {note}
        <section className="talk today-card" aria-label="今日はここまで">
          <p className="words">今日はここまで。見てくれてありがとう！</p>
          {limit < cards.length && (
            <button type="button" className="secondary" onClick={() => setLimit((value) => value + BATCH)}>
              もっと見る（あなたに近い人）
            </button>
          )}
        </section>
      </>
    );
  }

  const isCheered = card.likedByViewer || cheered.includes(card.postId);

  return (
    <>
      {note}
      <section
        className="talk today-card"
        aria-label={`${card.authorName}さんの投稿`}
        // 左へめくると次の人。ボタンの「次へ」と同じ
        onTouchStart={(event) => {
          touchX.current = event.touches.length === 1 ? event.touches[0].clientX : null;
        }}
        onTouchEnd={(event) => {
          const start = touchX.current;
          touchX.current = null;
          if (start !== null && start - event.changedTouches[0].clientX > 60) setIndex((value) => value + 1);
        }}
      >
        <p className="count">
          {index + 1} 枚目（全 {Math.min(limit, cards.length)} 枚）・{card.channelName}
        </p>
        <p className="who">
          <Avatar image={card.authorImage} alt={`${card.authorName}さんのパートナー`} size={40} />
          <strong>{card.authorName}</strong> <PersonTitle title={card.authorTitle} />（{card.authorLabel}）
        </p>
        {card.relatedReason && <p className="count related-line">おすすめ：{card.relatedReason}</p>}
        <p className="words">{card.body}</p>
        {card.researchedWithAi && <p className="count">AI と調べました</p>}
        {hints[card.postId] && <p className="hint-line">{hints[card.postId]}</p>}
        <div className="row">
          <button type="button" disabled={isCheered} onClick={() => void sendCheer(card.postId)}>
            {isCheered ? "応援しました" : "応援する"}
          </button>
          <button type="button" className="secondary" onClick={() => setIndex((value) => value + 1)}>
            次へ
          </button>
        </div>
        {problem && (
          <p className="notice" role="alert">
            {problem}
          </p>
        )}
        <CardReply key={card.postId} postId={card.postId} />
        <Link href={`/teams?channel=${card.channelId}`}>校内チャネルで見る</Link>
        <button type="button" className="hide-person" onClick={() => void hideAuthor(card.authorId, card.authorName)}>
          しばらく出さない
        </button>
      </section>
    </>
  );
}
