"use client";

import { type CSSProperties, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { schedulePop } from "@/lib/send-sound";
import {
  bloomExplanation,
  bloomFor,
  bloomShadow,
  CANOPY,
  EXPLAINED_KEY,
  FAST_FORWARD_STEP_MS,
  fastForwardCounts,
  FULL_BLOOM,
  LEAF_EVENT,
  leafSlot,
  MAX_FLYING_LEAVES,
  newLeaves,
  SEEN_LEAVES_KEY,
  type Season,
  type TimeOfDay,
} from "@/lib/sakura";
import { audioOutput } from "../sound";

/**
 * 絵の枠。木の全体（樹冠のてっぺん〜幹〜地面）だけを囲み、細い列でも切り取らずに縮めて収める（meet）。
 * 下の端（地面）をそろえ、余った所は枠の外まで描いた空と地面で埋まる
 */
const VIEW_TOP = -44;
const VIEW_BOX = `150 ${VIEW_TOP} 500 ${340 - VIEW_TOP}`;
const FIT = "xMidYMax meet";

/** 樹冠の円（座標は 800×340 の庭の中）。木の絵は RoomBackdrop の庭の描き方を写し、こちらで独自に持つ */
const BLOBS: [number, number, number][] = [
  [400, 92, 128],
  [288, 124, 84],
  [516, 124, 88],
  [342, 62, 70],
  [462, 58, 74],
  [224, 160, 52],
  [580, 160, 54],
];

/** 春の花の影の位置。樹冠の少し上に、うっすら重ねる */
const SHADOW_BLOBS: [number, number, number][] = [
  [400, 70, 96],
  [318, 96, 64],
  [486, 96, 66],
  [360, 40, 52],
  [446, 38, 54],
  [262, 132, 40],
  [544, 132, 42],
];

/** 設計書の時間（原則1）。飛ぶのは祝いの段、葉の間は 120ms */
const FLY_MS = 600;
const LEAF_GAP_MS = 120;
const GLOW_MS = 3000;

type Flight = { key: number; slot: number; delay: number; fromX: number; fromY: number };

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function readNumber(key: string): number | null {
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? null : Number(value);
  } catch {
    return null;
  }
}

function writeValue(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // 残せなくても、絵は出る
  }
}

/** 葉が着いた瞬間の「ポロン」の1音目（設計書 §2-8）。音の判定は sound.ts の口に任せる */
function landSound() {
  const output = audioOutput();
  if (!output) return;
  schedulePop(output.audio, output.out, output.audio.currentTime + 0.02, 79, 0.32);
}

function Garden({ season, fill, gradientId }: { season: Season; fill: number; gradientId: string }) {
  const colors = CANOPY[season];
  return (
    <>
      <defs>
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="0" y1={VIEW_TOP} x2="0" y2="340">
          <stop offset="0" stopColor="var(--minna-sky-top, #a9dcf5)" />
          <stop offset="1" stopColor="var(--minna-sky-bottom, #e4f6fb)" />
        </linearGradient>
      </defs>
      {/* 空と地面は絵の枠（viewBox）の外まで描き、幅の違う場面でも余った所が空と地面で埋まる */}
      <rect x="-2400" y="-1200" width="5600" height="1540" fill={`url(#${gradientId})`} />
      <ellipse cx="140" cy="60" rx="56" ry="16" fill="#fff" opacity="0.8" />
      <ellipse cx="680" cy="44" rx="66" ry="17" fill="#fff" opacity="0.8" />
      <path className="koekata-sakura-ground" d="M-2400 270H0q200-44 400-24t400-14H3200V800H-2400z" fill="#a8d58a" />
      <path className="koekata-sakura-trunk" d="M382 280q8-90-4-150h44q-12 60-4 150z" fill="#8a6549" />
      <path
        d="M396 170Q330 140 280 130M406 160q60-30 110-34M400 130q-30-40-60-60M402 128q26-34 60-64"
        stroke="#8a6549"
        strokeWidth="11"
        fill="none"
        strokeLinecap="round"
      />
      {colors.length > 0 &&
        BLOBS.map(([x, y, r], index) => (
          // 早回しでは、葉が集まるほど樹冠が満ちていく
          <circle key={`${x}-${y}`} cx={x} cy={y} r={r * (0.55 + 0.45 * fill)} fill={colors[index % colors.length]} opacity="0.94" />
        ))}
    </>
  );
}

/**
 * 校内の桜の場面。木の絵、春の見通しの花の影、人に届いたやり取りが葉になって飛んでくる動き、動画用の早回し。
 * 葉の数の表示は onCount で外（帯）にも伝える。
 */
export function SakuraScene({
  season,
  time,
  leaves,
  label = "校庭の桜の木",
  petals = 0,
  watchLeaves = false,
  autoExplain = false,
  fastForward = false,
  className = "",
  ariaLabel,
  as = "div",
  onCount,
  children,
}: {
  season: Season;
  time: TimeOfDay;
  leaves: number;
  label?: string;
  /** 舞う花びらの数（春やイベントのとき） */
  petals?: number;
  /** 前に見た枚数との差を飛ばし、同じ画面で届いた知らせ（LEAF_EVENT）も受ける */
  watchLeaves?: boolean;
  /** はじめて開いたときに1回だけ、春の見通しの説明を出す */
  autoExplain?: boolean;
  /** 動画用：0 枚から満開まで葉が集まり、春に咲く早回し */
  fastForward?: boolean;
  className?: string;
  ariaLabel?: string;
  as?: "div" | "section";
  onCount?(count: number, added: number): void;
  children?: ReactNode;
}) {
  const root = useRef<HTMLDivElement & HTMLElement>(null);
  const [count, setCount] = useState(leaves);
  const [added, setAdded] = useState(0);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [explaining, setExplaining] = useState(false);
  const [playing, setPlaying] = useState<null | "gather" | "bloom">(null);
  const nextKey = useRef(0);
  const report = useRef(onCount);
  useEffect(() => {
    report.current = onCount;
  }, [onCount]);

  // サーバーの数が変わったら（返信のあとの読み直しなど）、表示もそろえる
  useEffect(() => {
    if (!fastForward) setCount((shown) => Math.max(shown, leaves));
  }, [leaves, fastForward]);

  const countRef = useRef(count);
  useEffect(() => {
    countRef.current = count;
    report.current?.(count, added);
  }, [count, added]);

  /** 葉を n 枚、画面の右下から樹冠へ飛ばす。着くたびに数が1つ増える */
  const fly = useCallback((n: number, startCount: number, gap = LEAF_GAP_MS, sound = true) => {
    const box = root.current?.getBoundingClientRect();
    const width = box?.width ?? 360;
    const height = box?.height ?? 220;
    if (n <= 0) return;
    if (reducedMotion()) {
      // 減らす設定：飛ばさず、数と「+N枚」だけ
      setCount(startCount + n);
      return;
    }
    const born: Flight[] = Array.from({ length: n }, (_, i) => {
      const slot = startCount + i;
      const { x, y } = leafSlot(slot);
      return {
        key: nextKey.current++,
        slot,
        delay: i * gap,
        fromX: width * (0.96 - x / 100),
        fromY: height * (1.02 - y / 100),
      };
    });
    setFlights((now) => [...now.slice(-24), ...born]);
    born.forEach((flight, i) => {
      window.setTimeout(() => {
        setCount((shown) => Math.max(shown, startCount + i + 1));
        if (sound) landSound();
      }, flight.delay + FLY_MS);
      window.setTimeout(() => setFlights((now) => now.filter((f) => f.key !== flight.key)), flight.delay + FLY_MS + GLOW_MS);
    });
  }, []);

  // 0-1j(2)：前に見た枚数との差だけ、葉が飛んできて光る
  useEffect(() => {
    if (!watchLeaves || fastForward) return;
    const previous = readNumber(SEEN_LEAVES_KEY);
    writeValue(SEEN_LEAVES_KEY, String(leaves));
    const fresh = newLeaves(previous, leaves);
    if (fresh.added === 0) return;
    setAdded(fresh.added);
    const start = leaves - fresh.flying;
    setCount(start);
    const timer = window.setTimeout(() => fly(fresh.flying, start), 400);
    return () => window.clearTimeout(timer);
  }, [watchLeaves, fastForward, leaves, fly]);

  // 同じ画面で人に届いたとき（返事・いいね）
  useEffect(() => {
    if (!watchLeaves) return;
    const onLeaf = (event: Event) => {
      const n = Math.max(1, Math.min(MAX_FLYING_LEAVES, Number((event as CustomEvent<{ count?: number }>).detail?.count ?? 1)));
      const shown = countRef.current;
      setAdded((sum) => sum + n);
      writeValue(SEEN_LEAVES_KEY, String(shown + n));
      fly(n, shown);
    };
    window.addEventListener(LEAF_EVENT, onLeaf);
    return () => window.removeEventListener(LEAF_EVENT, onLeaf);
  }, [watchLeaves, fly]);

  // 0-1j(3)：はじめて開いたときに1回だけ、春の見通しを自動で出す
  useEffect(() => {
    if (!autoExplain || fastForward || readNumber(EXPLAINED_KEY) !== null) return;
    writeValue(EXPLAINED_KEY, "1");
    setExplaining(true);
  }, [autoExplain, fastForward]);

  // 0-1j(5)：動画用の早回し。葉が 0 から満開まで集まり、最後に春の色へ切り替わって花びらが舞う
  useEffect(() => {
    if (!fastForward) return;
    const counts = fastForwardCounts(0);
    setCount(0);
    setPlaying("gather");
    const timers: number[] = [];
    const lead = 800;
    counts.slice(1).forEach((value, i) => {
      timers.push(
        window.setTimeout(() => {
          setCount(value);
          // 全部を飛ばすと重いので、3枚に1枚だけ飛ばす
          if (i % 3 === 0) fly(1, value - 1, 0, false);
        }, lead + i * FAST_FORWARD_STEP_MS),
      );
    });
    timers.push(window.setTimeout(() => setPlaying("bloom"), lead + counts.length * FAST_FORWARD_STEP_MS + 700));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [fastForward, fly]);

  const shownSeason: Season = playing === "bloom" ? "haru" : season;
  const fill = playing === "gather" ? Math.min(1, count / FULL_BLOOM) : 1;
  const shadow = bloomShadow(count);
  const lines = bloomExplanation(count);
  const petalCount = playing === "bloom" ? 18 : petals;
  const Tag = as;

  return (
    <Tag
      ref={root}
      className={`sakura-scene koekata-sakura ${className}`}
      data-time={time}
      data-season={shownSeason}
      data-playing={playing ?? undefined}
      aria-label={ariaLabel}
    >
      <svg className="koekata-sakura-art" viewBox={VIEW_BOX} preserveAspectRatio={FIT} role="img" aria-label={label}>
        <Garden season={shownSeason} fill={fill} gradientId={`koekata-sky-${as}`} />
      </svg>
      {/* 0-1j(3)：春の見通し。今の葉の数で咲く花の影を、木の上にうっすら重ねる */}
      {shownSeason !== "haru" && (
        <svg className="koekata-sakura-shadow" viewBox={VIEW_BOX} preserveAspectRatio={FIT} aria-hidden="true">
          {SHADOW_BLOBS.slice(0, shadow.count).map(([x, y, r]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="#ffd3e1" opacity={shadow.opacity} />
          ))}
        </svg>
      )}
      <button
        type="button"
        className="koekata-sakura-forecast"
        aria-label={`春の咲き方の見通し（${bloomFor(count)}）`}
        aria-expanded={explaining}
        onClick={() => setExplaining((open) => !open)}
      />
      {Array.from({ length: petalCount }, (_, i) => (
        <span
          key={i}
          className="petal"
          aria-hidden="true"
          style={{ left: `${petalCount > 10 ? (i * 37) % 95 : 5 + i * 9}%`, animationDelay: `${i * (petalCount > 10 ? 0.4 : 0.7)}s` }}
        />
      ))}
      <span className="koekata-leaves" aria-hidden="true">
        {flights.map((flight) => {
          const { x, y } = leafSlot(flight.slot);
          return (
            <span
              key={flight.key}
              className="koekata-leaf"
              style={
                {
                  left: `${x}%`,
                  top: `${y}%`,
                  "--from-x": `${flight.fromX}px`,
                  "--from-y": `${flight.fromY}px`,
                  animationDelay: `${flight.delay}ms, ${flight.delay + FLY_MS}ms, ${flight.delay + FLY_MS}ms`,
                } as CSSProperties
              }
            />
          );
        })}
      </span>
      {added > 0 && (
        <span className="koekata-plus" role="status" key={added}>
          +{added}枚
        </span>
      )}
      {playing && (
        <span className="koekata-ff-count" role="status">
          {playing === "bloom" ? "春、満開になりました" : `葉 ${count} 枚`}
        </span>
      )}
      {explaining && (
        <div className="koekata-forecast-card" role="note" aria-label="春の見通し">
          {lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <button type="button" onClick={() => setExplaining(false)}>
            閉じる
          </button>
        </div>
      )}
      {children}
    </Tag>
  );
}
