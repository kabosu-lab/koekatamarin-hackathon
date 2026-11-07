"use client";

import { type PointerEvent, useCallback, useEffect, useRef, useState } from "react";

/**
 * 0-3p(2)(3)：今日の3人で応えたカード。横にシュッと払うと消える。返信・ありがとうをしたら、それだけで消える
 * （「届けました」を一瞬出してから、ふわっと縮む）。いいねは押したあとに払えば消える。
 * その日のうちは開き直しても出さない。端末ごとに投稿の ID だけを覚える（話の中身は残さない）。
 */
const KEY = "koekata_today_answered";
/** 「届けました」を見せる時間と、縮んで消える時間（設計書 §1：消えるのは素早く） */
export const ANSWER_SHOW_MS = 700;
export const ANSWER_LEAVE_MS = 260;
/** 払って飛んでいく時間 */
export const AWAY_MS = 220;
/** 払ったと決める指の量（カードの幅に対する割合）と、払う速さ（px/ms） */
const AWAY_RATIO = 0.3;
const AWAY_SPEED = 0.5;
/** 縦か横かを決める指の動き */
const LOCK = 8;

/** 今日の3人の1回の枚数。3人とも応えたら、次のおすすめを同じ数だけ出せる */
export const TODAY_BATCH = 3;

/** done：「届けました」、leaving：縮んで消える途中、left / right：その向きへ払って飛んでいく途中 */
export type AnswerPhase = "done" | "leaving" | "left" | "right";

function japanDay(now = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(now);
}

function read(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as { day?: string; ids?: unknown } | null;
    return saved?.day === japanDay() && Array.isArray(saved.ids) ? saved.ids.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/** 応えたことを、その日のうちだけ覚える（話す画面へ移る「ありがとう」でも、戻ったときに出さない） */
export function markAnswered(postId: string): void {
  try {
    const ids = read();
    if (!ids.includes(postId)) ids.push(postId);
    localStorage.setItem(KEY, JSON.stringify({ day: japanDay(), ids }));
  } catch {
    // 覚えられなくても、この画面では消える
  }
}

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 応えたカードの集まりと、いま消えていく途中のカードの段階 */
export function useAnswered() {
  const [answered, setAnswered] = useState<ReadonlySet<string>>(new Set());
  const [phase, setPhase] = useState<Record<string, AnswerPhase>>({});
  const timers = useRef<number[]>([]);

  // 画面に届いてから読む（サーバーの描画とずれないように）
  useEffect(() => {
    setAnswered(new Set(read()));
    const list = timers.current;
    return () => list.forEach(clearTimeout);
  }, []);

  const finish = useCallback((postId: string) => {
    setAnswered((current) => new Set([...current, postId]));
    setPhase((current) => {
      const next = { ...current };
      delete next[postId];
      return next;
    });
  }, []);

  /** 返信・ありがとうが届いた：「届けました」のあと、ふわっと縮んで消える（動きを減らす設定では、縮めずに消す） */
  const answer = useCallback(
    (postId: string) => {
      markAnswered(postId);
      setPhase((current) => (current[postId] ? current : { ...current, [postId]: "done" }));
      if (!reducedMotion()) {
        timers.current.push(window.setTimeout(() => setPhase((current) => ({ ...current, [postId]: "leaving" })), ANSWER_SHOW_MS));
      }
      timers.current.push(window.setTimeout(() => finish(postId), ANSWER_SHOW_MS + (reducedMotion() ? 0 : ANSWER_LEAVE_MS)));
    },
    [finish],
  );

  /** 横に払った：その向きへ飛んで消える（動きを減らす設定では、その場で消す） */
  const dismiss = useCallback(
    (postId: string, direction: "left" | "right") => {
      markAnswered(postId);
      if (reducedMotion()) {
        finish(postId);
        return;
      }
      setPhase((current) => ({ ...current, [postId]: direction }));
      timers.current.push(window.setTimeout(() => finish(postId), AWAY_MS));
    },
    [finish],
  );

  return { answered, phase, answer, dismiss };
}

type Swipe = { id: number; x: number; y: number; axis: null | "x" | "y"; lastX: number; lastT: number; vx: number };

/**
 * カードの上の横の指はカードが受ける（払うと消える）。縦の指は受けない（画面のスクロールや、モーダルのなでおろしに使う）。
 * 指に付いてくる量は CSS の変数 --swipe-x で、カードの要素に書く。返事の欄や文字の入力の中で始めた指は使わない。
 */
export function useSwipeAway(onAway: (direction: "left" | "right") => void) {
  const state = useRef<Swipe | null>(null);
  const swallowClick = useRef(false);

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    swallowClick.current = false;
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("textarea, input, select")) return;
    state.current = { id: event.pointerId, x: event.clientX, y: event.clientY, axis: null, lastX: event.clientX, lastT: performance.now(), vx: 0 };
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const s = state.current;
    if (!s || s.id !== event.pointerId) return;
    const dx = event.clientX - s.x;
    const dy = event.clientY - s.y;
    if (!s.axis) {
      if (Math.abs(dx) < LOCK && Math.abs(dy) < LOCK) return;
      s.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (s.axis === "y") {
        state.current = null;
        return;
      }
      // 横と決まってから指を捕まえる（押しただけのボタンはそのまま押せる）
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.setAttribute("data-swiping", "");
    }
    // 横の指は、画面の移動（スワイプ）に渡さない
    event.stopPropagation();
    const now = performance.now();
    s.vx = (event.clientX - s.lastX) / Math.max(1, now - s.lastT);
    s.lastX = event.clientX;
    s.lastT = now;
    if (!reducedMotion()) event.currentTarget.style.setProperty("--swipe-x", `${Math.round(dx)}px`);
  };

  const finish = (event: PointerEvent<HTMLElement>, cancelled: boolean) => {
    const s = state.current;
    if (!s || s.id !== event.pointerId) return;
    state.current = null;
    event.currentTarget.removeAttribute("data-swiping");
    if (!s.axis) return;
    swallowClick.current = true;
    const dx = event.clientX - s.x;
    const width = event.currentTarget.offsetWidth || 320;
    if (!cancelled && (Math.abs(dx) > width * AWAY_RATIO || Math.abs(s.vx) > AWAY_SPEED)) {
      onAway(dx < 0 ? "left" : "right");
      return;
    }
    event.currentTarget.style.setProperty("--swipe-x", "0px");
  };

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: (event: PointerEvent<HTMLElement>) => finish(event, false),
    onPointerCancel: (event: PointerEvent<HTMLElement>) => finish(event, true),
    // 払った指を離したときに、カードの中のボタンが押されないように
    onClickCapture: (event: { preventDefault(): void; stopPropagation(): void }) => {
      if (!swallowClick.current) return;
      swallowClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };
}

/** 3人とも応えたときの一言。先生には、です・ます */
export function todayDoneLine(polite: boolean): string {
  return polite ? "今日の3人は、おしまいです。ありがとうございます" : "今日の3人、おしまい。ありがとう";
}

/** 次のおすすめのボタンの文言 */
export function nextBatchLabel(count: number): string {
  return `次のおすすめを見る（${count}件）`;
}

/**
 * 並び（関係の深い順）から、いま出す束を決める。束はいくつ目まで出したか（batches）で決まり、応えたカードは除く。
 * 3人とも応えたら done、そのあとに残っている件数が rest（押すと次の束）。
 */
export function batchOf<T extends { postId: string }>(cards: readonly T[], batches: number, answered: ReadonlySet<string>) {
  const served = cards.slice(0, batches * TODAY_BATCH);
  const shown = served.filter((card) => !answered.has(card.postId));
  const rest = cards.slice(batches * TODAY_BATCH).filter((card) => !answered.has(card.postId)).length;
  return { shown, done: served.length > 0 && shown.length === 0, rest };
}

/**
 * 開いたときの並びを保つ。いいねや返事のあとの読み直しで、まだ反応のない投稿が反応ありになって並びが変わっても、
 * 目の前のカードを入れ替えない（中身＝いいねの数などは新しいものを使う）。
 */
export function useHeldOrder<T extends { postId: string }>(cards: readonly T[]): T[] {
  const [order] = useState(() => cards.map((card) => card.postId));
  const latest = useRef(new Map<string, T>());
  for (const card of cards) latest.current.set(card.postId, card);
  return order.flatMap((id) => {
    const card = latest.current.get(id);
    return card ? [card] : [];
  });
}
