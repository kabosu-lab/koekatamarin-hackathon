"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { isDeep, SWIPE_HOME, SWIPE_SCREENS, swipeTarget } from "@/lib/swipe-nav";
import { WIDE_QUERY } from "@/lib/wide";
import { Peek, remember, screenOf } from "./swipe-peek";
import { holdStrip, paneFromUrl, POSTED_EVENT, refreshPane, repairPanes, STRIP_LAND_EVENT, strip, stripReady, stripRest } from "./strip";

/**
 * 操作の途中の指の動きを、画面の移動にしない場所。
 * ボタンやリンクの上から始めても移れるようにする（動かした指ではボタンは押されない）。
 * 押し続けて話すボタンとホイール、文字を打つ欄は除く。
 */
const NO_SWIPE = "[data-noswipe], .device-mic, input, textarea, select, dialog, [contenteditable]";
/** 話す画面から先に読んでおく奥の画面（ホイールのチップの行き先） */
const DEEP_PREFETCH = ["/today", "/inbox", "/study/room", "/chie", "/me?open=goals", "/me?open=daily", "/me?open=lookback", "/me?open=settings"];
/** 3枚の上で、奥の状態（タイルを開いた・今日の3人を出した）を開いている印。あれば左右どちらでもホームへ戻る（0-2p） */
const DEEP_STATE = "[data-swipe-home]";
/** 奥の画面の部品が「ホームへ戻して」と頼む知らせ（今日の3人の、端の先へのめくり）。detail は SwipeHomeRequest */
export const SWIPE_HOME_EVENT = "koekata:swipe-home";
export type SwipeHomeRequest = { forward: boolean; layer?: HTMLElement | null };
/** 横画面は上下で移るので、上下にスクロールする液晶の中では移らない */
const LANDSCAPE = "(orientation: landscape) and (max-height: 560px)";
const NO_SWIPE_LANDSCAPE = "[data-noswipe-landscape]";
/** 左右へ動かしていると決める動きの大きさ。これより前は縦のスクロールとして扱う */
const LOCK_DISTANCE = 10;
const DIRECTION_KEY = "koekata_swipe_from";
/** 離した後の動きの長さ。払う速さに合わせて、この間に収める（設計書 §2-4 の慣性） */
const MIN_MS = 120;
const MAX_MS = 260;
/** これより遅い払い方でも、この速さ（px/ms）で動いたものとして時間を決める */
const MIN_SPEED = 0.6;
const BACK_MS = 200;
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
const SPRING = "cubic-bezier(0.34, 1.56, 0.64, 1)";

type Arrival = { from: "left" | "right"; ms: number; rest: number };

/** 使う人と見た目の cookie。変わったら、外側の話す画面を描き直す */
function whoAndLook(): string {
  return document.cookie
    .split("; ")
    .filter((pair) => /^koekata_(person|theme|size|avatar|sound)=/.test(pair))
    .sort()
    .join("; ");
}

/**
 * 左右の画面の中からの指の量を、帯の位置にする。0-3j：3つの画面は輪なので、端の先へもそのまま付いて動く
 * （反対の端の画面が隣から入る。strip.ts）。奥の画面（ring = false）は話す画面へ戻るだけなので、端の先は重くする
 */
function bandOffset(base: number, dx: number, ring = true): number {
  const width = window.innerWidth || 1;
  const outward = !ring && ((base === -1 && dx < 0) || (base === 1 && dx > 0));
  return base + (outward ? dx * 0.3 : dx) / width;
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const page = () => document.querySelector<HTMLElement>("body > main, main");
/** スワイプは狭い画面だけ（0-2y (3)）。広い画面は3列が並び、欄（iframe）の中の奥の画面は「戻る」で閉じる */
const swipes = () =>
  document.documentElement.dataset.embed !== "true" && document.documentElement.dataset.pane !== "true" && !window.matchMedia(WIDE_QUERY).matches;

/** 外側（話す画面）の帯が整っているか。左右の画面（iframe）の中から見る。読めなければ整っていないものとする */
function parentStripReady(): boolean {
  try {
    return window.parent.document.documentElement.dataset.stripReady === "true";
  } catch {
    return false;
  }
}

/** 指を置いた所から外へ向かって、横にスクロールできる入れ物（カルーセル、チップの列）があるか */
function insideSideScroller(target: Element | null): boolean {
  for (let node = target; node && node !== document.body; node = node.parentElement) {
    if (node.scrollWidth <= node.clientWidth + 1) continue;
    const overflow = getComputedStyle(node).overflowX;
    if (overflow === "auto" || overflow === "scroll") return true;
  }
  return false;
}

/** 文字を選んでいる途中か（選んだ範囲を指で広げているときに、画面を移さない） */
const selecting = () => {
  const selection = window.getSelection();
  return Boolean(selection && !selection.isCollapsed && selection.toString().trim());
};

/** 出ていく画面を、払った向きへ流す。新しい画面に入れ替わらなかったときは元に戻す */
function slideOut(elements: HTMLElement[], forward: boolean, ms: number) {
  const width = window.innerWidth || 1;
  for (const leaving of elements) {
    // 位置だけを transform で動かす（透明度は動かさない。iPhone では画面全体の重ね直しが重い）
    leaving.style.willChange = "transform";
    leaving.style.transition = `transform ${ms}ms ${EASE}`;
    leaving.style.transform = `translateX(${forward ? "-" : ""}${width}px)`;
    setTimeout(() => {
      // 移れたなら古い画面はもう無く、今の状態は新しい画面のもの。触らない
      if (!leaving.isConnected) return;
      delete document.documentElement.dataset.swiping;
      leaving.style.transition = "";
      leaving.style.transform = "";
      leaving.style.willChange = "";
    }, 1500);
  }
}

function saveArrival(arrival: Arrival) {
  try {
    sessionStorage.setItem(DIRECTION_KEY, JSON.stringify(arrival));
  } catch {
    // 残せなくても移れる
  }
}

/**
 * レトロの画面をスワイプで行き来する。指に付いて動き、離すと次の画面がすべり込む。下のナビからも同じ画面へ行ける。
 * 奥の画面（3枚のどれでもない画面と、3枚の上で開いた奥の状態）では、左右どちらへ払ってもホーム（話す）へ戻る（0-2p）。
 * 画面ごとには作らず、ここ1か所で受け持つ。
 */
export function SwipeNav() {
  const pathname = usePathname();
  const router = useRouter();

  // 隣の画面を先に読んでおき、移るときに待たせない
  useEffect(() => {
    // 左右の画面（iframe）の中では先読みしない。外側がする
    if (window.self !== window.top) return;
    if (SWIPE_SCREENS.includes(pathname as (typeof SWIPE_SCREENS)[number])) {
      for (const screen of SWIPE_SCREENS) if (screen !== pathname) router.prefetch(screen);
      // 0-2z：ホイールのチップで開く奥の画面も、話す画面から先に読んでおく
      if (pathname === SWIPE_HOME) for (const deep of DEEP_PREFETCH) router.prefetch(deep);
    } else router.prefetch(SWIPE_HOME);
  }, [pathname, router]);

  // 移ってきた画面を、指を動かした向きからすべり込ませる
  useEffect(() => {
    let arrival: Arrival | null = null;
    try {
      const saved = sessionStorage.getItem(DIRECTION_KEY);
      sessionStorage.removeItem(DIRECTION_KEY);
      if (saved === "left" || saved === "right") arrival = { from: saved, ms: MAX_MS, rest: 0.28 };
      else if (saved) arrival = JSON.parse(saved) as Arrival;
    } catch {
      // 残せなくても移れる
    }
    const main = page();
    if (!main || !arrival || (arrival.from !== "left" && arrival.from !== "right") || reducedMotion()) return;
    // 指で払ったときは、チラ見せの姿がもう同じ位置まで来ている。重ねて動かさない（0-2z）
    if (Number(arrival.rest) === 0) return;
    // 出ていった画面の残りの距離から、同じ時間・同じイージングで入ってくる（間を空けない）
    const rest = Math.min(1, Math.max(0, Number(arrival.rest) || 0));
    const ms = Math.min(MAX_MS, Math.max(MIN_MS, Number(arrival.ms) || MAX_MS));
    const offset = `${arrival.from === "right" ? "" : "-"}${Math.round(rest * 100)}%`;
    main.animate([{ transform: `translateX(${offset})` }, { transform: "translateX(0)" }], { duration: ms, easing: EASE });
  }, [pathname]);

  // 0-2z：話す画面の帯を、左右の画面（iframe）の中からも動かせるようにする。
  // 帯が止まったら、着いた先を新しくする（外側は話す画面へ戻ったとき、左右の画面はその中で）。「戻る」では帯を合わせる
  useEffect(() => {
    // 外側（話す画面）を描いたときの、使う人と見た目の印
    const drawnAs = whoAndLook();
    const onLand = (event: Event) => {
      const to = (event as CustomEvent<number>).detail;
      // 左右の画面の中では router.refresh しない。重いときに、先読みした別の画面（受信箱・広報など）の中身に
      // 描き替わってしまうことがあった。左右の画面は、外側が画面の外にある間に読み直す（strip.ts の refreshPane）
      if (window.self !== window.top) return;
      // 外側は、左右の画面で人や見た目が替わっていたら、話す画面へ戻ったときに窓ごと読み直す。
      // router.refresh は使わない（読み直しの途中で帯がまた左右へ動くと、遅れて届いた話す画面の木で帯が元へ戻ってしまう）
      // 読み直すと左右の画面も新しい人で読み込み直す。URL の引数は残す
      if (to === 0 && whoAndLook() !== drawnAs) {
        holdStrip();
        location.reload();
      }
    };
    window.addEventListener(STRIP_LAND_EVENT, onLand);
    if (window.self !== window.top) return () => window.removeEventListener(STRIP_LAND_EVENT, onLand);
    window.koekataStrip = strip;
    // 話す画面から投稿したら、画面の外のみんなを読み直しておく（帯で開いたときに、送った投稿が出ている）
    const onPosted = () => refreshPane("right");
    window.addEventListener(POSTED_EVENT, onPosted);
    // 帯を動かせるようになった印（html[data-strip-ready]）。左右の画面の読み込みを見て付け外しする（画面テストもこれを待つ）
    const root = document.documentElement;
    // 左右の画面があるのに 3 秒たっても整わなければ、左右の画面を入口から読み直す
    let waitingSince = 0;
    const watchReady = window.setInterval(() => {
      if (stripReady()) {
        root.dataset.stripReady = "true";
        waitingSince = 0;
        return;
      }
      delete root.dataset.stripReady;
      const panes = document.querySelectorAll('.device-row > .wide-panel[data-mode="pane"] iframe').length;
      if (panes < 2 || root.dataset.stripHold === "true") {
        waitingSince = 0;
        return;
      }
      if (!waitingSince) waitingSince = performance.now();
      else if (performance.now() - waitingSince > 3000) {
        repairPanes();
        waitingSince = 0;
      }
    }, 250);
    const onPop = () => {
      if (!document.querySelector(".device-row")) return;
      strip.settle(stripRest(), 0, paneFromUrl(), "none");
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.clearInterval(watchReady);
      window.removeEventListener(POSTED_EVENT, onPosted);
      window.removeEventListener(STRIP_LAND_EVENT, onLand);
      window.removeEventListener("popstate", onPop);
    };
  }, [router]);

  useEffect(() => {
    let start: { x: number; y: number } | null = null;
    let dragging = false;
    // 0-2z：帯（話す画面と、裏で読み込んだ左右の画面）を動かしているか。paneMode は左右の画面の中から動かすとき
    let banded = false;
    let paneMode = false;
    let base = 0;
    // 帯の今の位置（指が取り消されたときに、ここからばねで戻す）
    let bandAt = 0;
    let main: HTMLElement | null = null;
    // 横画面か・動きを減らす設定かは、指を置いたときに1回だけ調べる（動かすたびに matchMedia しない）
    let landscape = false;
    // 奥の画面か。奥では横画面でも左右で戻る
    let deep = false;
    // 0-3j：左右の画面の中から、輪の端の先へ動かしてよいか（奥の画面ではなく、外側の帯が整っている）。
    // 整う前は、反対の端の画面がまだ読み込まれていない箱に着かないよう、端の先は今までどおり重くして元へ戻す
    let ring = false;
    let still = false;
    // 速さを出すための、直近2回の指の位置と時刻
    let recent: { x: number; t: number }[] = [];
    // 0-2z：ドラッグ中の隣の画面のチラ見せ
    let peek: Peek | null = null;

    const dropPeek = () => {
      peek?.remove();
      peek = null;
    };

    /** 指の向きに見える隣の画面。向きが変わったら、反対の隣に替える */
    const peekToward = (dx: number) => {
      if (!main || dx === 0) return;
      const target = swipeTarget(pathname, Math.sign(dx) * 1000, 0, false, deep);
      const side = dx < 0 ? 1 : -1;
      if (peek && peek.target === target && peek.side === side) return;
      dropPeek();
      if (target) peek = new Peek(target, side, main);
    };

    const reset = () => {
      // 0-2z：帯をつかんでいる途中で指が取り消されたら（touchcancel）、帯を元の位置へ戻す
      if (dragging && banded) strip.settle(bandAt, 0, stripRest());
      if (dragging && paneMode) window.parent.koekataStrip?.settle(bandAt, 0, base as -1 | 1, "push", ring);
      banded = false;
      dropPeek();
      delete document.documentElement.dataset.swiping;
      if (main) {
        main.style.transition = "";
        main.style.transform = "";
        main.style.willChange = "";
      }
      main = null;
      dragging = false;
    };

    const onStart = (event: TouchEvent) => {
      const target = event.target as Element | null;
      landscape = window.matchMedia(LANDSCAPE).matches;
      still = reducedMotion();
      deep = isDeep(pathname, document.querySelector(DEEP_STATE) !== null);
      const root = document.documentElement;
      paneMode = root.dataset.pane === "true" && Boolean(window.parent?.koekataStrip);
      banded = false;
      const blocked =
        event.touches.length !== 1 ||
        root.dataset.theme !== "retro" ||
        // 広い画面と、その左右の欄（iframe）の中では移らない。欄の中でホームへ移ると、欄の中が話す画面になってしまう。
        // 狭い画面で裏に読み込んだ左右の画面（pane）の中からは、外側の帯を動かす
        (!paneMode && !swipes()) ||
        target?.closest(NO_SWIPE) ||
        (landscape && !deep && target?.closest(NO_SWIPE_LANDSCAPE)) ||
        insideSideScroller(target) ||
        selecting();
      start = blocked ? null : { x: event.touches[0].clientX, y: event.touches[0].clientY };
      recent = start ? [{ x: start.x, t: event.timeStamp }] : [];
      dragging = false;
    };

    const onMove = (event: TouchEvent) => {
      // 横画面の3枚は上下で移るので、指には付けない。奥の画面は横画面でも左右に付いて動く
      if (!start || (landscape && !deep) || still) return;
      const point = { x: event.touches[0].clientX, t: event.timeStamp };
      recent = recent.length ? [recent[recent.length - 1], point] : [point];
      const dx = event.touches[0].clientX - start.x;
      const dy = event.touches[0].clientY - start.y;
      if (!dragging) {
        if (Math.abs(dx) < LOCK_DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.6) return;
        if (paneMode) {
          dragging = true;
          base = (window.frameElement as HTMLElement | null)?.dataset.side === "left" ? 1 : -1;
          ring = !deep && parentStripReady();
        } else if (pathname === SWIPE_HOME && !deep && !landscape && window.self === window.top && stripReady()) {
          dragging = true;
          banded = true;
        }
      }
      if (paneMode) {
        bandAt = bandOffset(base, dx, ring);
        window.parent.koekataStrip?.drag(bandAt, ring);
        return;
      }
      if (banded) {
        bandAt = dx / (window.innerWidth || 1);
        strip.drag(bandAt);
        return;
      }
      if (!dragging) {
        main = screenOf();
        if (!main) return;
        dragging = true;
        // 今の姿を覚えておく（次にこの画面へ戻るときのチラ見せ）
        remember(pathname, main);
        // 動かしている間は、窓の 3D の描画を止める（VoiceLump が見る）。指の動きに GPU を回す
        document.documentElement.dataset.swiping = "true";
        main.style.willChange = "transform";
        main.style.transition = "none";
      }
      // 0-2z：指に1対1で付いて動き、隣の画面がチラ見えする
      peekToward(dx);
      if (peek) {
        peek.move(dx);
        return;
      }
      // 指に付いて動く。遠くへ行くほど少し重くする
      const moved = Math.sign(dx) * Math.min(Math.abs(dx), 40 + Math.abs(dx) * 0.85);
      if (main) {
        // 位置だけを transform で動かす。透明度を毎コマ変えると、iPhone では画面全体の重ね直しが重い（0-1i）
        main.style.transform = `translateX(${moved}px)`;
      }
    };

    const onEnd = (event: TouchEvent) => {
      if (!start) return;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - start.x;
      const next = swipeTarget(pathname, dx, touch.clientY - start.y, landscape, deep);
      const sideways = !landscape || deep;
      const forward = (sideways ? dx : touch.clientY - start.y) < 0;
      start = null;
      if ((paneMode || banded) && dragging) {
        // 0-2z：帯は、ホイールと同じばねで吸い付く。URL は replaceState で替える（strip.ts）
        const width = window.innerWidth || 1;
        const [a, b] = recent.length >= 2 ? recent : [{ x: touch.clientX, t: 0 }, { x: touch.clientX, t: 1 }];
        const velocity = ((b.x - a.x) / Math.max(1, b.t - a.t)) * (1000 / width);
        dragging = false;
        if (banded) {
          banded = false;
          strip.settle(dx / width, velocity, next ? (dx < 0 ? -1 : 1) : 0);
          return;
        }
        // 左右の画面の中から：払った向きの輪の隣へ（0-3j。端の先は反対の端の画面）。
        // 奥の画面では左右どちらへ払っても話す画面へ戻る（0-2p）
        // 帯が整う前の端の先（ring でない）は、元の位置へ戻す
        let to: number = base;
        const outward = (base === -1 && dx < 0) || (base === 1 && dx > 0);
        if (next) to = deep ? 0 : ring || !outward ? base + (dx < 0 ? -1 : 1) : base;
        window.parent.koekataStrip?.settle(bandOffset(base, dx, ring), velocity, to, "push", ring);
        return;
      }
      // 左右の画面の中では、指に付かなかった払い方でも、その中では移らない（外側の帯だけが動く）
      if (paneMode) return;
      if (peek && main && dragging) {
        // 0-2z：離したら、ホイールと同じばねで吸い付く。届けば隣の画面へ、届かなければ元の位置へ
        const [a, b] = recent.length >= 2 ? recent : [{ x: touch.clientX, t: 0 }, { x: touch.clientX, t: 1 }];
        const velocity = (b.x - a.x) / Math.max(1, b.t - a.t);
        const settling = peek;
        const moving = main;
        peek = null;
        main = null;
        dragging = false;
        const finish = () => {
          settling.remove();
          delete document.documentElement.dataset.swiping;
          if (moving.isConnected) {
            moving.style.transform = "";
            moving.style.transition = "";
            moving.style.willChange = "";
          }
        };
        if (!next || next !== settling.target) {
          settling.settle(dx, velocity, 0, finish);
          return;
        }
        saveArrival({ from: forward ? "right" : "left", ms: MAX_MS, rest: 0 });
        router.push(next);
        const path = next.split("?")[0];
        const began = performance.now();
        settling.settle(dx, velocity, forward ? -1 : 1, () => {
          // 新しい画面に入れ替わってから、チラ見せの姿を外す（入れ替わる前に外すと、古い画面が一瞬見える）
          const wait = () => {
            if (location.pathname === path && !moving.isConnected) requestAnimationFrame(finish);
            else if (performance.now() - began > 3000) finish();
            else setTimeout(wait, 30);
          };
          wait();
        });
        return;
      }
      if (!next) {
        // 届かなければ、ばねで1回だけ元の位置へ戻す
        if (main && dragging) {
          const back = main;
          back.style.transition = `transform ${BACK_MS}ms ${SPRING}`;
          back.style.transform = "translateX(0)";
          setTimeout(() => {
            if (main === back) reset();
            else {
              delete document.documentElement.dataset.swiping;
              back.style.transition = "";
              back.style.willChange = "";
            }
          }, BACK_MS);
          main = null;
          dragging = false;
        }
        return;
      }
      const leaving = main ?? page();
      const width = window.innerWidth || 1;
      // 払った速さ（px/ms）。速く払えば速く、ゆっくり離せばゆっくり吸い付く
      const [a, b] = recent.length >= 2 ? recent : [{ x: touch.clientX, t: 0 }, { x: touch.clientX, t: 1 }];
      const speed = Math.max(Math.abs((b.x - a.x) / Math.max(1, b.t - a.t)), MIN_SPEED);
      const moved = leaving ? Math.abs(new DOMMatrixReadOnly(getComputedStyle(leaving).transform).m41) : 0;
      const remaining = Math.max(0, width - moved);
      const ms = Math.round(Math.min(MAX_MS, Math.max(MIN_MS, remaining / speed)));
      const animate = Boolean(leaving) && !still && sideways;
      // 次の画面は、指を動かした向きの反対側から、出ていった画面の残りの距離と同じ時間で入ってくる
      saveArrival({ from: forward ? "right" : "left", ms, rest: animate ? remaining / width : 0.28 });
      if (leaving && animate) slideOut([leaving], forward, ms);
      // 離した瞬間に次の画面を読み込み始める。出ていく動きの終わりを待たない
      router.push(next);
      main = null;
      dragging = false;
    };

    // 部品からの「ホームへ戻して」（今日の3人の端の先へのめくり）。受けたら preventDefault で知らせる
    const onHomeRequest = (event: Event) => {
      const root = document.documentElement;
      // 帯の左右の画面（pane）の中からは、外側の帯を話す画面へ戻す（今日の3人の端の先へのめくりなど）
      if (root.dataset.pane === "true" && window.parent?.koekataStrip) {
        event.preventDefault();
        const side = (window.frameElement as HTMLElement | null)?.dataset.side === "left" ? 1 : -1;
        window.parent.koekataStrip.settle(side, 0, 0);
        return;
      }
      if (root.dataset.theme !== "retro" || !swipes()) return;
      event.preventDefault();
      const { forward, layer } = (event as CustomEvent<SwipeHomeRequest>).detail ?? { forward: true };
      const animate = !reducedMotion();
      saveArrival({ from: forward ? "right" : "left", ms: MAX_MS, rest: animate ? 1 : 0.28 });
      const leaving = [page(), layer].filter((element): element is HTMLElement => Boolean(element));
      if (animate) slideOut(leaving, forward, MAX_MS);
      router.push(SWIPE_HOME);
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener(SWIPE_HOME_EVENT, onHomeRequest);
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", reset, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", reset);
      window.removeEventListener(SWIPE_HOME_EVENT, onHomeRequest);
      reset();
    };
  }, [pathname, router]);

  return null;
}
