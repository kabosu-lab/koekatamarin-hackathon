"use client";

import { type Ref, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  CENTER_SCALE,
  START_DEGREES,
  TICK_DEGREES,
  VISIBLE,
  clicksBetween,
  layoutOf,
  shownPos,
  slotTarget,
  snapTarget,
  springSettled,
  springStep,
  wrapIndex,
} from "@/lib/wheel-carousel";
import { Chip, type ChipItem } from "./Chip";
import { playWheelClick, playWheelOpen } from "./wheel-sound";
import "./wheel-carousel.css";

/** 親（ClickWheel の持ち主）から呼ぶ操作。毎コマの位置は React の state にしない（Talk 全体を描き直さないため） */
export type WheelCarouselHandle = {
  /** 輪をなぞった角度の差（度）。12度を越えたところで暗くなり、チップが出る */
  turn(deltaDegrees: number): void;
  /** 指が「離すとやめる」場所（輪の外か真ん中のマイクの上）にあるか。true の間はチップが少し縮む */
  setCancelHint(on: boolean): void;
  /** 指を離した。cancel を省くと setCancelHint の最後の値を使う */
  release(options?: { cancel?: boolean }): void;
  /** 何も開かずに、すぐ消す（画面が変わるときなど） */
  reset(): void;
};

type Phase = "idle" | "turning" | "settling" | "opening" | "closing";

const SPRING = "cubic-bezier(0.34, 1.56, 0.64, 1)";
const STANDARD = "cubic-bezier(0.2, 0.8, 0.2, 1)";
/** 指が止まったとみなすまで（ms） */
const IDLE_MS = 80;
/** 開く動きの長さ（ばね） */
const OPEN_MS = 220;
/** 暗幕が消える長さ（標準） */
const FADE_MS = 160;

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** チップの基準の幅（chip.css の --chip-width の初めの値） */
const BASE_CHIP = 112;
/** これより小さくすると名前が読めない */
const MIN_CHIP = 56;
/** 真ん中のチップ（拡大した分も含む）の高さを、窓の高さのこの割合までにする */
const CHIP_SHARE = 0.38;
/** チップと説明を、窓の上下の端からこれだけ離す */
const EDGE = 8;

/**
 * 窓（置き場所の箱）の高さに合わせて、チップの大きさを決め、チップと説明の一文を合わせて窓の上下のまん中に寄せる。
 * 説明は必ず窓の中に収める。チップの幅は --chip-width で渡し、基準に対する倍率を返す（横の間隔に使う）。
 */
function fitToWindow(root: HTMLElement | null, caption: HTMLElement | null): number {
  const height = root?.parentElement?.clientHeight ?? 0;
  if (!root || height <= 0) return 1;
  const width = Math.max(MIN_CHIP, Math.min(BASE_CHIP, (height * CHIP_SHARE) / (1.4 * CENTER_SCALE)));
  root.style.setProperty("--chip-width", `${width.toFixed(1)}px`);
  // 真ん中からの上下（チップは 5:7、真ん中は CENTER_SCALE 倍。説明の上は retro.css の top と同じ式）
  const top = -(width * 1.4 * CENTER_SCALE) / 2;
  const bottom = width * 0.84 + 14 + (caption?.offsetHeight || 48);
  let shift = -(top + bottom) / 2;
  shift = Math.max(shift, -height / 2 + EDGE - top);
  // 説明が窓の下で切れないことを、いちばん先に守る
  shift = Math.min(shift, height / 2 - EDGE - bottom);
  root.style.top = `calc(50% + ${shift.toFixed(1)}px)`;
  return width / BASE_CHIP;
}

function transformOf(x: number, y: number, rotate: number, scale: number): string {
  return `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotate(${rotate.toFixed(2)}deg) scale(${scale.toFixed(4)})`;
}

/**
 * ホイールをなぞって機能を選ぶチップのカルーセル（0-1g(3)、設計書 §2-1-C）。
 * 窓の上に置く帯（position: absolute）と、画面全体の暗幕を描く。DOM のチップは常に5枚。
 * 位置は ref に持ち、requestAnimationFrame 1本で5枚の transform と opacity だけを書く。
 */
export function WheelCarousel({
  items,
  initial = 0,
  sound = true,
  onOpen,
  onCancel,
  onTick,
  ref,
}: {
  items: ChipItem[];
  /** なぞり始めたときに真ん中に来る項目の番号 */
  initial?: number;
  /** カリとポンを鳴らすか（鳴らすときも音の設定に従う） */
  sound?: boolean;
  /** 真ん中のチップが開いた（開く動きの頂点で呼ぶ。ここで router.push する） */
  onOpen(item: ChipItem): void;
  /** やめた（何も開かない） */
  onCancel?(): void;
  /** 真ん中に新しいチップが座った（パートナーを小さく揺らすなど。rAF の中で呼ぶので state を変えない） */
  onTick?(item: ChipItem): void;
  ref?: Ref<WheelCarouselHandle>;
}) {
  const n = items.length;
  const rootRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLParagraphElement>(null);
  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [slotItems, setSlotItems] = useState<number[]>(() =>
    Array.from({ length: VISIBLE }, (_, slot) => wrapIndex(initial + slotTarget(slot, 0), n)),
  );

  // 毎コマ変わるものはすべて ref に置く
  const state = useRef({
    phase: "idle" as Phase,
    armed: 0, // なぞりに入る前に動いた角度
    origin: initial, // pos=0 のときの真ん中の項目
    pos: 0,
    springV: 0, // ばねの速さ（枚/秒）
    target: 0,
    shown: 0,
    lastMoveAt: 0,
    velocity: 0, // 指の速さ（枚/ms）
    bumpAt: -Infinity,
    cancelHint: false,
    reduced: false,
    frame: 0,
    lastFrame: 0,
    slotItems: slotItems,
    centerSlot: -1,
    captionId: "",
    unit: 1, // 窓に合わせたチップの大きさ（基準の 112px に対する倍率）。横の間隔もこれで縮める
    timers: [] as number[],
  });
  // 最新の呼び先を ref に（rAF とタイマーから古いものを呼ばない）
  const latest = useRef({ items, initial, onOpen, onCancel, onTick, sound });
  latest.current = { items, initial, onOpen, onCancel, onTick, sound };

  useImperativeHandle(ref, () => {
    const s = state.current;

    function setPhase(phase: Phase) {
      s.phase = phase;
      if (rootRef.current) rootRef.current.dataset.state = phase === "settling" ? "turning" : phase;
      if (phase === "idle") delete document.documentElement.dataset.wheeling;
      else document.documentElement.dataset.wheeling = "true";
    }

    function later(fn: () => void, ms: number) {
      s.timers.push(window.setTimeout(fn, ms));
    }

    function clearTimers() {
      for (const id of s.timers) window.clearTimeout(id);
      s.timers = [];
    }

    function stopLoop() {
      if (s.frame) cancelAnimationFrame(s.frame);
      s.frame = 0;
    }

    function cancelAnimations() {
      for (const el of slotRefs.current) for (const a of el?.getAnimations() ?? []) a.cancel();
    }

    function toIdle() {
      stopLoop();
      clearTimers();
      cancelAnimations();
      s.armed = 0;
      s.cancelHint = false;
      if (rootRef.current) delete rootRef.current.dataset.cancelHint;
      setPhase("idle");
    }

    function centerItem(): ChipItem | undefined {
      const its = latest.current.items;
      if (its.length === 0) return undefined;
      return its[wrapIndex(s.origin + Math.round(s.shown), its.length)];
    }

    /** 0-2o(2)：真ん中のチップの説明を一文で。替わったときだけ書く（読み上げは aria-live で1回） */
    function writeCaption() {
      const item = centerItem();
      const id = item?.id ?? "";
      if (id === s.captionId) return;
      s.captionId = id;
      const el = captionRef.current;
      if (!el) return;
      el.textContent = item ? (item.description ? `${item.label}：${item.description}` : item.label) : "";
      // 文の長さで行数が変わるので、チップと説明の置き場所を測り直す
      s.unit = fitToWindow(rootRef.current, el);
    }

    /** 5枚の置き場所を書く。ここで書くのは transform と opacity だけ */
    function paint(now: number) {
      const count = latest.current.items.length;
      const desired: number[] = [];
      let center = -1;
      for (let slot = 0; slot < VISIBLE; slot++) {
        const m = slotTarget(slot, s.shown);
        desired.push(wrapIndex(s.origin + m, count));
        const layout = layoutOf(m - s.shown);
        let scale = layout.scale;
        if (layout.center) {
          center = slot;
          const t = now - s.bumpAt;
          if (!s.reduced && t >= 0 && t < 120) scale += 0.06 * Math.sin((Math.PI * t) / 120);
        }
        if (s.cancelHint) scale *= 0.96;
        const el = slotRefs.current[slot];
        if (!el) continue;
        el.style.transform = transformOf(layout.x * s.unit, layout.y * s.unit, layout.rotate, scale);
        el.style.opacity = layout.opacity.toFixed(3);
      }
      if (center !== s.centerSlot) {
        slotRefs.current.forEach((el, slot) => {
          if (!el) return;
          if (slot === center) el.dataset.center = "true";
          else delete el.dataset.center;
        });
        s.centerSlot = center;
      }
      // 中身の差し替えは見えない端（2.5枚の外）でしか起きない。そのときだけ描き直す
      if (desired.some((v, i) => v !== s.slotItems[i])) {
        s.slotItems = desired;
        setSlotItems(desired);
      }
    }

    function startOpen() {
      const item = centerItem();
      if (!item) return toIdle();
      stopLoop();
      setPhase("opening");
      if (latest.current.sound) playWheelOpen();
      const els = slotRefs.current;
      els.forEach((el, slot) => {
        if (!el) return;
        const from = el.style.transform;
        if (slot === s.centerSlot) {
          if (s.reduced) return;
          el.animate([{ transform: from }, { transform: `${from} scale(1.18)` }], {
            duration: OPEN_MS,
            easing: SPRING,
            fill: "forwards",
          });
        } else {
          const side = slotTarget(slot, s.shown) < Math.round(s.shown) ? -1 : 1;
          if (s.reduced) {
            el.style.opacity = "0";
            return;
          }
          el.animate(
            [
              { transform: from, opacity: el.style.opacity },
              { transform: `translate3d(${side * 24}px, 0, 0) ${from}`, opacity: 0 },
            ],
            { duration: 140, easing: "ease-in", fill: "forwards" },
          );
        }
      });
      // 頂点で開く。次の画面が出るのと同時に暗幕とチップを消す
      later(
        () => {
          latest.current.onOpen(item);
          finish(120);
        },
        s.reduced ? 0 : OPEN_MS,
      );
    }

    /** 暗幕とチップを消して、待ち状態に戻す */
    function finish(chipFadeMs: number) {
      setPhase("closing");
      const el = s.centerSlot >= 0 ? slotRefs.current[s.centerSlot] : null;
      if (el && !s.reduced) {
        el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: chipFadeMs, easing: "ease-in", fill: "forwards" });
      }
      later(toIdle, s.reduced ? 0 : FADE_MS);
    }

    function cancel() {
      stopLoop();
      clearTimers();
      if (rootRef.current) delete rootRef.current.dataset.cancelHint;
      // 真ん中の光を消してから、全部をフェード
      const el = s.centerSlot >= 0 ? slotRefs.current[s.centerSlot] : null;
      if (el) delete el.dataset.center;
      s.centerSlot = -1;
      if (!s.reduced) {
        for (const chip of slotRefs.current) {
          chip?.animate([{ opacity: chip.style.opacity }, { opacity: 0 }], { duration: FADE_MS, easing: STANDARD, fill: "forwards" });
        }
      }
      setPhase("closing");
      later(toIdle, s.reduced ? 0 : FADE_MS);
      latest.current.onCancel?.();
    }

    function frame(now: number) {
      const dt = Math.min(0.05, Math.max(0, (now - (s.lastFrame || now)) / 1000));
      s.lastFrame = now;

      if (s.phase === "turning" && !s.reduced && now - s.lastMoveAt > IDLE_MS) {
        // 指が止まったら、最寄りの刻みへばねで寄せる
        const next = springStep(s.pos, s.springV, Math.round(s.pos), dt);
        s.pos = next.x;
        s.springV = next.v;
      } else if (s.phase === "settling") {
        const next = springStep(s.pos, s.springV, s.target, dt);
        s.pos = next.x;
        s.springV = next.v;
        if (springSettled(s.pos, s.springV, s.target)) s.pos = s.target;
      }

      const before = s.shown;
      if (s.reduced) s.shown = Math.round(s.pos);
      else s.shown = s.phase === "turning" ? shownPos(s.pos) : s.pos;
      const clicks = clicksBetween(before, s.shown);
      if (clicks > 0) {
        s.bumpAt = now;
        if (latest.current.sound) playWheelClick(clicks);
        writeCaption();
        const item = centerItem();
        if (item) latest.current.onTick?.(item);
      }
      paint(now);

      if (s.phase === "settling" && s.pos === s.target) {
        startOpen();
        return;
      }
      s.frame = requestAnimationFrame(frame);
    }

    function startLoop() {
      if (s.frame) return;
      s.lastFrame = 0;
      s.frame = requestAnimationFrame(frame);
    }

    function activate() {
      clearTimers();
      cancelAnimations();
      s.reduced = reducedMotion();
      const its = latest.current.items;
      // なぞり始めるたびに、決めた項目を真ん中にして始める
      s.origin = wrapIndex(latest.current.initial, its.length);
      s.pos = 0;
      s.shown = 0;
      s.springV = 0;
      s.velocity = 0;
      s.centerSlot = -1;
      s.captionId = "";
      s.lastMoveAt = performance.now();
      setPhase("turning");
      // 先に説明を書いて窓に合わせた大きさを決めてから、チップを置く
      writeCaption();
      paint(s.lastMoveAt);
      startLoop();
    }

    return {
      turn(deltaDegrees) {
        if (!Number.isFinite(deltaDegrees) || latest.current.items.length === 0) return;
        if (s.phase === "opening" || s.phase === "closing" || s.phase === "settling") return;
        if (s.phase === "idle") {
          s.armed += deltaDegrees;
          if (Math.abs(s.armed) < START_DEGREES) return;
          activate();
          return;
        }
        const now = performance.now();
        const step = deltaDegrees / TICK_DEGREES;
        const v = step / Math.max(1, now - s.lastMoveAt);
        // 最後の2回の動きをならした速さ
        s.velocity = now - s.lastMoveAt > IDLE_MS ? v : (s.velocity + v) / 2;
        s.lastMoveAt = now;
        s.springV = 0;
        s.pos += step;
      },
      setCancelHint(on) {
        if (s.cancelHint === on) return;
        s.cancelHint = on;
        if (rootRef.current) {
          if (on) rootRef.current.dataset.cancelHint = "true";
          else delete rootRef.current.dataset.cancelHint;
        }
        // 減らす設定でも縮みは見せる（意味を残す）。ループが止まっていても一度書く
        if (s.phase === "turning") paint(performance.now());
      },
      release(options) {
        if (s.phase === "idle") {
          // なぞりに入る前に離した：何も起きない
          s.armed = 0;
          return;
        }
        if (s.phase !== "turning") return;
        const shouldCancel = options?.cancel ?? s.cancelHint;
        if (shouldCancel) return cancel();
        const now = performance.now();
        const v = s.reduced || now - s.lastMoveAt > IDLE_MS ? 0 : s.velocity;
        s.target = snapTarget(s.pos, v);
        // 枚/ms を 枚/秒 に
        s.springV = v * 1000;
        if (s.reduced) {
          s.pos = s.target;
          s.shown = s.target;
          paint(now);
          return startOpen();
        }
        s.phase = "settling";
        startLoop();
      },
      reset() {
        toIdle();
      },
    };
  }, []);

  // 窓（置き場所の箱）の大きさが変わったら、チップの大きさと置き場所を合わせ直す
  useEffect(() => {
    const root = rootRef.current;
    const box = root?.parentElement;
    if (!root || !box) return;
    const refit = () => {
      state.current.unit = fitToWindow(root, captionRef.current);
    };
    refit();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(refit);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  // 外されたら、ループとタイマーを止め、暗転の印を外す
  useEffect(() => {
    const s = state.current;
    return () => {
      if (s.frame) cancelAnimationFrame(s.frame);
      for (const id of s.timers) window.clearTimeout(id);
      delete document.documentElement.dataset.wheeling;
    };
  }, []);

  if (n === 0) return null;

  return (
    <div className="wheel-carousel" ref={rootRef} data-state="idle">
      <div className="wheel-scrim" aria-hidden="true" />
      {/* 0-2o(2)：チップの下の暗い幕の上に、選んでいるチップの説明。中身は writeCaption が直接書く */}
      <p className="wheel-carousel-caption" ref={captionRef} aria-live="polite" />
      <div className="wheel-carousel-band" aria-hidden="true">
        {slotItems.map((index, slot) => {
          const item = items[index] ?? items[0];
          return (
            <div
              key={slot}
              className="wheel-carousel-slot"
              ref={(el) => {
                slotRefs.current[slot] = el;
              }}
            >
              <Chip item={item} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
