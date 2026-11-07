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
import { cardAttr, PostSubject } from "@/app/PostSubject";
import { STRIP_LAND_EVENT } from "../strip";
import { useLift } from "../column-lift";
import { TODAY_PARAM, TODAY_PENDING, TODAY_SHOW_EVENT } from "../WidePanels";
import { batchOf, markAnswered, nextBatchLabel, todayDoneLine, useAnswered, useHeldOrder } from "../today/answered";


/** 設計書 §1：移動は 160〜260ms、消えるときは ease-in で素早く */
const CLOSE_MS = 160;
/** 払って消すと決める指の量（カードの幅に対する割合）と、払う速さ（px/ms） */
const AWAY_RATIO = 0.3;
const AWAY_SPEED = 0.5;
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
  subject: string | null;
  body: string;
  likeCount: number;
  liked: boolean;
  replyCount: number;
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
 * 広い画面の右の欄（iframe）の中でも、その日はじめてなら欄の中で開く。
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
    if (!openWhenShown || (window.frameElement as HTMLElement | null)?.dataset.mode !== "pane") return;
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
    // 開いたときに1回だけ決める。帯で着いたときの読み直し（router.refresh）で、開いたモーダルを閉じたり印を付け直したりしない。
    // 欄（iframe）の中かどうかはクライアントで決める（サーバーの sec-fetch-dest は読み直しのときに iframe にならない）
    if (!initialOpen) return;
    // 帯の裏で読み込んだだけの「みんな」では開かない。帯で見せたときに上の onShown が開く
    let inPane = false;
    try {
      inPane = (window.frameElement as HTMLElement | null)?.dataset.mode === "pane";
    } catch {
      // 別の場所から埋め込まれたときは、欄として扱う
    }
    if (inPane) {
      setOpen(false);
      setOpened(false);
      return;
    }
    markSeen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const show = () => {
    markSeen();
    setOpened(true);
    setOpen(true);
  };
  // ホイールの「今日の3人」から来たとき：下の帯の「今日の3人」を押したときと同じく開く。
  // 帯の中のみんなへは知らせ（TODAY_SHOW_EVENT）で、列の中や1画面で開いたみんなへは ?today=1 で届く
  useEffect(() => {
    const pending = window as unknown as Record<string, unknown>;
    const onShow = () => {
      delete pending[TODAY_PENDING];
      show();
    };
    window.addEventListener(TODAY_SHOW_EVENT, onShow);
    // 動き出す前に知らせが来ていたら、印を見て開く
    if (pending[TODAY_PENDING]) onShow();
    const url = new URL(location.href);
    if (url.searchParams.get(TODAY_PARAM) === "1") {
      url.searchParams.delete(TODAY_PARAM);
      history.replaceState(history.state, "", url.pathname + url.search + url.hash);
      show();
    }
    return () => window.removeEventListener(TODAY_SHOW_EVENT, onShow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
 * 今日の3人のカード。1人ずつ出し、その場でいいね・返事・ありがとうができる。
 * 0-3p：カードは横にシュッと払うと消える（返事・ありがとうをしたら、それだけで消える）。めくるのは下の ‹ › と矢印キー。
 * 3人とも応えたら「おしまい」と、次のおすすめがあれば「次のおすすめを見る（N件）」。
 * 外を押す・下へなでおろす・「みんなを見る」で閉じる。
 */
export function TodayModal({ cards: incoming, polite = false }: { cards: TodayModalCard[]; polite?: boolean }) {
  const { open, hide } = useToday();
  // 0-3p(2)(3)：応えたカードは消え、3人とも応えたら「おしまい」。次の3人は押したときだけ
  const { answered, phase, answer, dismiss } = useAnswered();
  const allCards = useHeldOrder(incoming);
  const [batches, setBatches] = useState(1);
  const { shown: cards, done: allDone, rest } = batchOf(allCards, batches, answered);
  // 0-3m：3列のときは、3列の上に全画面で（column-lift.ts）
  useLift(open);
  const [closing, setClosing] = useState(false);
  const [index, setIndex] = useState(0);
  const sheet = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const swallowClick = useRef(false);
  const total = cards.length + 1;
  const last = total - 1;
  // 消えたカードの分だけ、次のカードが今の場所へ来る。最後を越えたら「おしまい」へ
  const at = Math.min(index, last);
  useEffect(() => {
    if (index > last) setIndex(last);
  }, [index, last]);

  // 開くたびに1枚目から。手前に来たら読み上げと鍵盤の焦点をカードへ
  useEffect(() => {
    if (!open) return;
    setIndex(0);
    setClosing(false);
    sheet.current?.focus({ preventScroll: true });
  }, [open]);

  // 見た記録（あなたの投稿を見てくれました）。残らなくても続けられる
  const shownId = open ? cards[at]?.postId : undefined;
  useEffect(() => {
    if (!shownId) return;
    void fetch("/api/today/seen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId: shownId }),
    }).catch(() => {});
  }, [shownId]);

  // 焦点がカードの外（ページの地など）にあっても、Escape で閉じる。カードの中は下の onKeyDown が受け持つ
  const closeRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target && (sheet.current?.contains(target) || target.closest("textarea, input"))) return;
      closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

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
  closeRef.current = close;

  const go = (next: number) => setIndex(Math.min(last, Math.max(0, next)));
  const current = () => track.current?.children[at] as HTMLElement | undefined;

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
    // 帯の中（pane）では、話す画面へ戻したあと、モーダルは閉じておく（次に開いたときに残らない）
    const inPane = (window.frameElement as HTMLElement | null)?.dataset.mode === "pane";
    if ((!handled && forward) || (handled && inPane)) close();
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
      // カードは指に付いてくる（払うと消える）。おしまいのカードは重くして、端だと分かるように
      setVar(current() ?? null, "--swipe-x", at === last ? dx * 0.3 : dx);
    } else {
      setVar(sheet.current, "--dy", Math.max(0, dy));
    }
  };

  const finish = (event: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const state = drag.current;
    if (!state || state.id !== event.pointerId) return;
    drag.current = null;
    sheet.current?.removeAttribute("data-dragging");
    if (!state.axis) return;
    swallowClick.current = state.moved > LOCK;
    if (cancelled) {
      sheet.current?.style.setProperty("--dy", "0px");
      return;
    }
    if (state.axis === "x") {
      const dx = event.clientX - state.x;
      const width = track.current?.offsetWidth ?? 320;
      const away = Math.abs(dx) > width * AWAY_RATIO || Math.abs(state.vx) > AWAY_SPEED;
      // 0-3p(2)：カードを払うと、その向きへ飛んで消える。おしまいのカードの先は、奥の画面としてホームへ（0-2p）
      if (away && at < last) {
        dismiss(cards[at].postId, dx < 0 ? "left" : "right");
        return;
      }
      current()?.style.setProperty("--swipe-x", "0px");
      if (away) pastEdge(dx < 0);
      return;
    }
    const dy = event.clientY - state.y;
    if (dy > DROP_DISTANCE || state.vy > DROP_SPEED) close();
    else sheet.current?.style.setProperty("--dy", "0px");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("textarea, input")) return;
    if (event.key === "Escape") close();
    else if (event.key === "ArrowRight") go(at + 1);
    else if (event.key === "ArrowLeft") go(at - 1);
  };

  return (
    <div className="minna-today-layer" data-state={closing ? "closing" : "open"} data-noswipe data-lift-layer>
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
          <div ref={track} className="minna-today-track" style={{ "--i": at } as CSSProperties}>
            {cards.map((card, i) => (
              <article
                key={card.postId}
                className="minna-today-card"
                {...cardAttr(card.subject)}
                aria-label={`${card.authorName}さんの投稿`}
                aria-hidden={i !== at}
                inert={i !== at}
                data-answer={phase[card.postId]}
              >
                <p className="minna-today-kind">{batches > 1 ? "次のおすすめ" : "今日の3人"}</p>
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
                <PostSubject subject={card.subject} className="minna-today-subject" />
                <p className="minna-today-body">{card.body}</p>
                <ReplyField
                  postId={card.postId}
                  authorName={card.authorName}
                  own={false}
                  likeCount={card.likeCount}
                  liked={card.liked}
                  replyCount={card.replyCount}
                  onAnswered={() => answer(card.postId)}
                />
                {/* ありがとうは話す画面へ移るので、押した時点で応えたことにする（戻ったときに出さない） */}
                <span className="minna-today-thanks" onClickCapture={() => markAnswered(card.postId)}>
                  <CardThanks card={card} />
                </span>
                {(phase[card.postId] === "done" || phase[card.postId] === "leaving") && (
                  <p className="minna-today-answered" role="status">
                    届けました
                  </p>
                )}
              </article>
            ))}
            <section className="minna-today-card minna-today-end" aria-label="おしまい" aria-hidden={at !== last} inert={at !== last}>
              <h2>おしまい</h2>
              <p>{allDone ? todayDoneLine(polite) : allCards.length > 0 ? "今日はここまで。見てくれてありがとう！" : "今見られる投稿はまだありません。"}</p>
              {allDone && rest > 0 && (
                <button
                  type="button"
                  className="minna-today-next"
                  onClick={() => {
                    setBatches((value) => value + 1);
                    setIndex(0);
                  }}
                >
                  {nextBatchLabel(rest)}
                </button>
              )}
            </section>
          </div>
        </div>
        <div className="minna-today-foot">
          <button type="button" className="minna-today-step" aria-label="前へ" disabled={at === 0} onClick={() => go(at - 1)}>
            ‹
          </button>
          <span className="minna-today-dots" aria-label={`${at + 1} 枚目（全 ${total} 枚）`} role="img">
            {Array.from({ length: total }, (_, i) => (
              <i key={i} data-current={i === at ? "" : undefined} />
            ))}
          </span>
          <button type="button" className="minna-today-step" aria-label="次へ" disabled={at === last} onClick={() => go(at + 1)}>
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
