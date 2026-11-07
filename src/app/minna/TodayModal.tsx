"use client";

import { Icon } from "@/app/Icon";
import { createContext, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { Avatar } from "../Avatar";
import { SWIPE_HOME_EVENT, type SwipeHomeRequest } from "../SwipeNav";
import { ThanksEntry } from "../thanks/ThanksCard";
import { thanksEntryLabel } from "@/lib/thanks-kind";

/** 投稿の種類に合う入口だけ置く。困りごと・悩みには置かない */
function CardThanks({ card }: { card: { authorId: string; authorName: string; authorLabel: string; kind: string } }) {
  const label = thanksEntryLabel(card.kind);
  return label ? <ThanksEntry person={{ id: card.authorId, name: card.authorName, label: card.authorLabel }} label={label} /> : null;
}
import { ReplyField } from "./ReplyField";
import { TODAY_SEEN_COOKIE } from "./today-seen";
import { STRIP_LAND_EVENT } from "../strip";


/** 設計書 §1：移動は 160〜260ms、消えるときは ease-in で素早く */
const CLOSE_MS = 160;
/** めくると決める指の量（カードの幅に対する割合）と、払う速さ（px/ms） */
const FLIP_RATIO = 0.2;
const FLIP_SPEED = 0.5;
/** 下へなでおろして閉じる量と速さ */
const DROP_DISTANCE = 90;
const DROP_SPEED = 0.6;
/** 縦か横かを決める指の動き */
const LOCK = 8;

export type TodayModalCard = {
  postId: string;
  authorId: string;
  authorName: string;
  authorLabel: string;
  authorImage: string;
  channelName: string;
  body: string;
  likeCount: number;
  liked: boolean;
  replyCount: number;
  /** 3人のあとの、関係のありそうな投稿 */
  related: boolean;
  reason?: string;
  kind: string;
};

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 日本時間の次の0時までの秒数 */
function secondsToJapanMidnight(now = Date.now()): number {
  const day = 86_400_000;
  const japan = now + 9 * 3_600_000;
  return Math.max(60, Math.ceil((day - (japan % day)) / 1000));
}

function markSeen() {
  document.cookie = `${TODAY_SEEN_COOKIE}=1; path=/; max-age=${secondsToJapanMidnight()}; samesite=lax`;
}

type Today = { open: boolean; opened: boolean; show(): void; hide(): void };

const TodayContext = createContext<Today>({ open: false, opened: false, show: () => {}, hide: () => {} });

export const useToday = () => useContext(TodayContext);

/**
 * 今日の3人のモーダルの開け閉め（0-1x）。その日はじめて「みんな」を開いたときだけ自動で開く。
 * 埋め込みの欄（広い画面の左右）では自動で開かない。
 */
export function TodayProvider({
  initialOpen,
  openWhenShown = false,
  children,
}: {
  initialOpen: boolean;
  /** 0-2z：狭い画面の帯で裏に読み込んだ「みんな」は、帯で開かれたときに、その日はじめてなら開く */
  openWhenShown?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(initialOpen);
  // 0-2v：一度開いたら、下の帯の数を消す
  const [opened, setOpened] = useState(initialOpen);
  useEffect(() => {
    if (!openWhenShown || document.documentElement.dataset.pane !== "true") return;
    const onShown = () => {
      if (document.cookie.split("; ").some((pair) => pair.startsWith(`${TODAY_SEEN_COOKIE}=`))) return;
      markSeen();
      setOpened(true);
      setOpen(true);
    };
    window.addEventListener(STRIP_LAND_EVENT, onShown);
    return () => window.removeEventListener(STRIP_LAND_EVENT, onShown);
  }, [openWhenShown]);
  useEffect(() => {
    if (!initialOpen) return;
    if (window.self !== window.top) {
      setOpen(false);
      return;
    }
    markSeen();
  }, [initialOpen]);
  const show = () => {
    markSeen();
    setOpened(true);
    setOpen(true);
  };
  return <TodayContext.Provider value={{ open, opened, show, hide: () => setOpen(false) }}>{children}</TodayContext.Provider>;
}

/** 0-2v：今日の3人の画面（/today）を開いたら、今日はもう見たことにする */
export function MarkTodaySeen() {
  useEffect(() => markSeen(), []);
  return null;
}

/** 下の帯の「今日の3人」。2回目からはここから開く */
export function TodayEntrance({ badge = 0 }: { badge?: number }) {
  const { show, opened } = useToday();
  return (
    <button type="button" className="minna-dock-item" aria-haspopup="dialog" onClick={show}>
      <Icon name="heart" />
      {badge > 0 && !opened && <span className="minna-dock-badge">{badge}</span>}
      {/* 狭い欄では「今日の」「3人」の2行に折る（途中で切らない。0-2i） */}
      <span>
        今日の<wbr />
        3人
      </span>
    </button>
  );
}

type Drag = {
  id: number;
  x: number;
  y: number;
  axis: null | "x" | "y";
  moved: number;
  lastX: number;
  lastY: number;
  lastT: number;
  vx: number;
  vy: number;
};

/**
 * 今日の3人のカード。1人ずつ、左右になでるとめくれ、その場でいいねと返事ができる。
 * 3人のあとは関係のありそうな投稿が理由の一言付きで続き、最後は「おしまい」。
 * 外を押す・下へなでおろす・「みんなを見る」で閉じる。
 */
export function TodayModal({ cards }: { cards: TodayModalCard[] }) {
  const { open, hide } = useToday();
  const [closing, setClosing] = useState(false);
  const [index, setIndex] = useState(0);
  const sheet = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const swallowClick = useRef(false);
  const total = cards.length + 1;
  const last = total - 1;

  // 開くたびに1枚目から。手前に来たら読み上げと鍵盤の焦点をカードへ
  useEffect(() => {
    if (!open) return;
    setIndex(0);
    setClosing(false);
    sheet.current?.focus({ preventScroll: true });
  }, [open]);

  // 見た記録（あなたの投稿を見てくれました）。残らなくても続けられる
  const shownId = open ? cards[index]?.postId : undefined;
  useEffect(() => {
    if (!shownId) return;
    void fetch("/api/today/seen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId: shownId }),
    }).catch(() => {});
  }, [shownId]);

  if (!open) return null;

  const close = () => {
    if (closing) return;
    if (reducedMotion()) {
      hide();
      return;
    }
    setClosing(true);
    window.setTimeout(hide, CLOSE_MS);
  };

  const go = (next: number) => setIndex(Math.min(last, Math.max(0, next)));

  /**
   * 端の先へめくったとき（0-2p）。カードのめくりを先にし、端からさらに払ったら奥の画面としてホームへ戻る。
   * ホームへの移動はスワイプの受け持ち（SwipeNav）に頼む。受け持ちがない見た目では、最後の先だけ閉じる。
   */
  const pastEdge = (forward: boolean) => {
    const request = new CustomEvent<SwipeHomeRequest>(SWIPE_HOME_EVENT, {
      cancelable: true,
      detail: { forward, layer: sheet.current?.parentElement },
    });
    const handled = !window.dispatchEvent(request);
    if (!handled && forward) close();
  };

  const setVar = (element: HTMLElement | null, name: string, value: number) => element?.style.setProperty(name, `${Math.round(value)}px`);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // 前のなでた指で click が来なかったときも、次の押しは届ける
    swallowClick.current = false;
    if (event.button !== 0 || closing) return;
    // 返事の欄の中で始めた指は、文字を選ぶのに使う
    if ((event.target as HTMLElement).closest("textarea, input")) return;
    const now = performance.now();
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, axis: null, moved: 0, lastX: event.clientX, lastY: event.clientY, lastT: now, vx: 0, vy: 0 };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state || state.id !== event.pointerId) return;
    const dx = event.clientX - state.x;
    const dy = event.clientY - state.y;
    if (!state.axis) {
      if (Math.abs(dx) < LOCK && Math.abs(dy) < LOCK) return;
      if (Math.abs(dx) >= Math.abs(dy)) state.axis = "x";
      else if (dy > 0) state.axis = "y";
      else {
        drag.current = null;
        return;
      }
      // 向きが決まってから指を捕まえる（押しただけのボタンはそのまま押せる）
      event.currentTarget.setPointerCapture(event.pointerId);
      sheet.current?.setAttribute("data-dragging", "");
    }
    const now = performance.now();
    const dt = Math.max(1, now - state.lastT);
    state.vx = (event.clientX - state.lastX) / dt;
    state.vy = (event.clientY - state.lastY) / dt;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    state.lastT = now;
    state.moved = Math.max(state.moved, Math.abs(dx), Math.abs(dy));
    if (state.axis === "x") {
      // 端の先は重くして、行けないことを手で分かるように
      const atEdge = (index === 0 && dx > 0) || (index === last && dx < 0);
      setVar(track.current, "--dx", atEdge ? dx * 0.3 : dx);
    } else {
      setVar(sheet.current, "--dy", Math.max(0, dy));
    }
  };

  const finish = (event: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const state = drag.current;
    if (!state || state.id !== event.pointerId) return;
    drag.current = null;
    sheet.current?.removeAttribute("data-dragging");
    track.current?.style.setProperty("--dx", "0px");
    if (!state.axis) return;
    swallowClick.current = state.moved > LOCK;
    if (cancelled) {
      sheet.current?.style.setProperty("--dy", "0px");
      return;
    }
    if (state.axis === "x") {
      const dx = event.clientX - state.x;
      const width = track.current?.offsetWidth ?? 320;
      if (dx < -width * FLIP_RATIO || state.vx < -FLIP_SPEED) {
        if (index === last) pastEdge(true);
        else go(index + 1);
      } else if (dx > width * FLIP_RATIO || state.vx > FLIP_SPEED) {
        if (index === 0) pastEdge(false);
        else go(index - 1);
      }
      return;
    }
    const dy = event.clientY - state.y;
    if (dy > DROP_DISTANCE || state.vy > DROP_SPEED) close();
    else sheet.current?.style.setProperty("--dy", "0px");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("textarea, input")) return;
    if (event.key === "Escape") close();
    else if (event.key === "ArrowRight") go(index + 1);
    else if (event.key === "ArrowLeft") go(index - 1);
  };

  return (
    <div className="minna-today-layer" data-state={closing ? "closing" : "open"} data-noswipe>
      <div className="minna-today-scrim" aria-hidden="true" onClick={close} />
      <div
        ref={sheet}
        className="minna-today-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="今日の3人"
        tabIndex={-1}
        data-noswipe
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => finish(event, false)}
        onPointerCancel={(event) => finish(event, true)}
        onClickCapture={(event) => {
          // なでた指を離したときに、下のボタンが押されないように
          if (!swallowClick.current) return;
          swallowClick.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <span className="minna-today-handle" aria-hidden="true" />
        <div className="minna-today-window">
          <div ref={track} className="minna-today-track" style={{ "--i": index } as CSSProperties}>
            {cards.map((card, i) => (
              <article
                key={card.postId}
                className="minna-today-card"
                aria-label={`${card.authorName}さんの投稿`}
                aria-hidden={i !== index}
                inert={i !== index}
              >
                <p className="minna-today-kind">{card.related ? "あなたに関係のありそうな投稿" : "今日の3人"}</p>
                <header className="minna-today-who">
                  <Avatar image={card.authorImage} alt={`${card.authorName}さんのパートナー`} size={44} lazy={i > 0} />
                  <span>
                    <strong>{card.authorName}</strong>
                    <small>
                      {card.authorLabel}・{card.channelName}
                    </small>
                  </span>
                </header>
                {card.reason && <p className="minna-today-reason">おすすめ：{card.reason}</p>}
                <p className="minna-today-body">{card.body}</p>
                <ReplyField
                  postId={card.postId}
                  authorName={card.authorName}
                  own={false}
                  likeCount={card.likeCount}
                  liked={card.liked}
                  replyCount={card.replyCount}
                />
                <CardThanks card={card} />
              </article>
            ))}
            <section className="minna-today-card minna-today-end" aria-label="おしまい" aria-hidden={index !== last} inert={index !== last}>
              <h2>おしまい</h2>
              <p>{cards.length > 0 ? "今日はここまで。見てくれてありがとう！" : "今見られる投稿はまだありません。"}</p>
            </section>
          </div>
        </div>
        <div className="minna-today-foot">
          <button type="button" className="minna-today-step" aria-label="前へ" disabled={index === 0} onClick={() => go(index - 1)}>
            ‹
          </button>
          <span className="minna-today-dots" aria-label={`${index + 1} 枚目（全 ${total} 枚）`} role="img">
            {Array.from({ length: total }, (_, i) => (
              <i key={i} data-current={i === index ? "" : undefined} />
            ))}
          </span>
          <button type="button" className="minna-today-step" aria-label="次へ" disabled={index === last} onClick={() => go(index + 1)}>
            ›
          </button>
          <button type="button" className="minna-today-done" onClick={close}>
            みんなを見る
          </button>
        </div>
      </div>
    </div>
  );
}
