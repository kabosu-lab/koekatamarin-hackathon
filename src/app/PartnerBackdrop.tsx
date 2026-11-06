"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import {
  addSeenRare,
  type Backdrop,
  type BackdropPlace,
  type BackdropRare,
  type BackdropTime,
  backdropDateKey,
  parseBackdropParam,
  parseSeenRares,
  pickBackdrop,
  rarePrefix,
  seenRaresKey,
} from "@/lib/partner-backdrop";
import "./partner-backdrop.css";

/** 時刻の境目を見るための間隔 */
const CHECK_MS = 60_000;

/** 太陽と月の位置（窓の空の中）。場所ごとの空の位置に合わせる */
const SUN: Record<BackdropTime, { x: number; y: number; r: number }> = {
  morning: { x: 0.25, y: 0.7, r: 16 },
  noon: { x: 0.6, y: 0.25, r: 18 },
  evening: { x: 0.8, y: 0.8, r: 20 },
  night: { x: 0.7, y: 0.3, r: 12 },
};

/** 夜の星。番号から決める（描き直しで変わらないように） */
const STARS = Array.from({ length: 14 }, (_, i) => ({ x: (i * 37 + 11) % 100, y: (i * 53 + 7) % 60, r: i % 3 === 0 ? 1.6 : 1 }));

function Sky({ id, x, y, width, height, time }: { id: string; x: number; y: number; width: number; height: number; time: BackdropTime }) {
  const sun = SUN[time];
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={`url(#${id}-sky)`} />
      {time === "night" &&
        STARS.map((star, index) => (
          <circle
            key={index}
            className="pb-star"
            cx={x + (star.x / 100) * width}
            cy={y + (star.y / 100) * height}
            r={star.r}
            fill="#fff8d8"
            style={{ animationDelay: `${-index * 0.7}s` }}
          />
        ))}
      <circle cx={x + sun.x * width} cy={y + sun.y * height} r={sun.r} fill="var(--pb-sun)" />
      {time !== "night" && (
        <>
          <ellipse cx={x + width * 0.3} cy={y + height * 0.3} rx={width * 0.16} ry={6} fill="#fff" opacity="0.7" />
          <ellipse cx={x + width * 0.78} cy={y + height * 0.55} rx={width * 0.12} ry={5} fill="#fff" opacity="0.55" />
        </>
      )}
    </g>
  );
}

/** 教室：左に大きな窓、右に黒板と時計 */
function Classroom({ id, time }: { id: string; time: BackdropTime }) {
  return (
    <>
      <rect width="400" height="300" fill="var(--pb-wall)" />
      <Sky id={id} x={24} y={36} width={170} height={150} time={time} />
      <path d="M109 36v150M24 111h170" stroke="var(--pb-wood-dark)" strokeWidth="4" />
      <rect x="24" y="36" width="170" height="150" fill="none" stroke="var(--pb-wood-dark)" strokeWidth="6" />
      <rect x="18" y="186" width="182" height="7" fill="var(--pb-wood)" />
      <path d="M24 30h26q-6 80 4 160H24z" fill="var(--pb-curtain)" opacity="0.85" />
      <rect x="220" y="70" width="164" height="96" rx="3" fill="var(--pb-board)" stroke="var(--pb-wood-dark)" strokeWidth="6" />
      <path d="M238 104q36-14 66 0t56-4M246 140q40 10 90-2" stroke="#fff" strokeOpacity="0.14" strokeWidth="9" fill="none" strokeLinecap="round" />
      <rect x="230" y="166" width="144" height="5" fill="var(--pb-wood)" />
      <circle cx="302" cy="38" r="13" fill="#fff8ea" stroke="var(--pb-wood-dark)" strokeWidth="3" />
      <path d="M302 38v-8M302 38l-6 4" stroke="#3a2b28" strokeWidth="2" strokeLinecap="round" />
      <rect y="236" width="400" height="64" fill="var(--pb-floor)" />
      <rect y="232" width="400" height="6" fill="var(--pb-wood-dark)" opacity="0.6" />
    </>
  );
}

/** 校庭：広い空、遠くの校舎、土のグラウンドと木 */
function Schoolyard({ id, time }: { id: string; time: BackdropTime }) {
  return (
    <>
      <Sky id={id} x={0} y={0} width={400} height={210} time={time} />
      <path d="M0 196q80-30 170-14t230-10v40H0z" fill="var(--pb-hill)" />
      <g fill="var(--pb-building)">
        <rect x="236" y="138" width="150" height="62" />
        <rect x="292" y="118" width="38" height="20" />
      </g>
      <circle cx="311" cy="128" r="6" fill="var(--pb-wall)" />
      {[0, 1, 2, 3, 4].map((col) =>
        [0, 1].map((row) => (
          <rect key={`${col}-${row}`} x={246 + col * 28} y={148 + row * 24} width={16} height={12} fill="var(--pb-window-glass)" />
        )),
      )}
      <rect y="200" width="400" height="100" fill="var(--pb-ground)" />
      <path d="M0 214h400" stroke="var(--pb-wood-dark)" strokeWidth="1.5" opacity="0.4" />
      {Array.from({ length: 21 }, (_, i) => (
        <path key={i} d={`M${i * 20} 200v14`} stroke="var(--pb-wood-dark)" strokeWidth="1.5" opacity="0.4" />
      ))}
      <ellipse cx="200" cy="262" rx="120" ry="22" fill="none" stroke="#fff" strokeOpacity="0.5" strokeWidth="2" />
      <path d="M66 236q4-54-2-90h18q-6 36-2 90z" fill="var(--pb-trunk)" />
      <circle cx="72" cy="134" r="40" fill="var(--pb-leaf)" />
      <circle cx="44" cy="156" r="26" fill="var(--pb-leaf)" />
      <circle cx="102" cy="154" r="28" fill="var(--pb-leaf)" />
    </>
  );
}

/** 廊下：奥へ続く床、左に窓の並び、右に教室の戸 */
function Hallway({ id, time }: { id: string; time: BackdropTime }) {
  return (
    <>
      <rect width="400" height="300" fill="var(--pb-wall)" />
      <path d="M0 0h400L250 110H150z" fill="var(--pb-ceiling)" />
      <path d="M0 300h400L250 170H150z" fill="var(--pb-floor)" />
      <path d="M0 0L150 110V170L0 300z" fill="var(--pb-wall-side)" />
      <path d="M400 0L250 110V170L400 300z" fill="var(--pb-wall-side)" />
      <rect x="150" y="110" width="100" height="60" fill="var(--pb-wall)" />
      <clipPath id={`${id}-left`}>
        <path d="M14 46L60 76V176L14 210zM78 88L112 110V164L78 186zM124 118L142 129V158L124 170z" />
      </clipPath>
      <g clipPath={`url(#${id}-left)`}>
        <Sky id={id} x={0} y={40} width={150} height={175} time={time} />
      </g>
      <path d="M14 46L60 76V176L14 210zM78 88L112 110V164L78 186zM124 118L142 129V158L124 170z" fill="none" stroke="var(--pb-wood-dark)" strokeWidth="3" />
      <path d="M352 70L296 108V214L352 252z" fill="var(--pb-wood)" stroke="var(--pb-wood-dark)" strokeWidth="3" />
      <path d="M342 100L306 122V160L342 148z" fill="var(--pb-window-glass)" />
      <path d="M272 126L258 135V188L272 196z" fill="var(--pb-wood)" stroke="var(--pb-wood-dark)" strokeWidth="2" />
      {[0.25, 0.5, 0.75].map((t) => (
        <path key={t} d={`M${150 - 150 * t * 1.6 > 0 ? 150 - 150 * t * 1.6 : 0} ${170 + 130 * t}H${250 + 150 * t * 1.6 < 400 ? 250 + 150 * t * 1.6 : 400}`} stroke="var(--pb-wood-dark)" strokeWidth="1.5" opacity="0.25" />
      ))}
      <path d="M200 170V300" stroke="var(--pb-wood-dark)" strokeWidth="1.5" opacity="0.2" />
      <path d="M150 110L0 0M250 110L400 0" stroke="var(--pb-wood-dark)" strokeWidth="1" opacity="0.3" />
      <rect x="182" y="34" width="36" height="8" rx="2" fill="var(--pb-light)" opacity="0.8" />
      <rect x="190" y="72" width="20" height="5" rx="2" fill="var(--pb-light)" opacity="0.8" />
    </>
  );
}

const BOOK_COLORS = ["#a6432f", "#2f5d73", "#c28f2c", "#4f7a4c", "#7a4a78", "#d9cdb4", "#33415c", "#b5653a"];

/** 本棚。自習室の図書館と同じ描き方（番号から本の幅と高さを決める）を、窓の大きさで描き直したもの */
function Shelf({ x, width }: { x: number; width: number }) {
  const rows = [18, 76, 134, 192];
  return (
    <g>
      <rect x={x} y={0} width={width} height={250} fill="var(--pb-wood-dark)" />
      {rows.map((y, row) => {
        const books = [];
        let bookX = x + 6;
        let index = row * 3 + Math.round(x);
        while (bookX < x + width - 10) {
          const bookWidth = 6 + ((index * 7) % 6);
          const bookHeight = 32 + ((index * 5) % 13);
          books.push(
            <rect key={index} x={bookX} y={y + 46 - bookHeight} width={bookWidth} height={bookHeight} rx={1} fill={BOOK_COLORS[index % BOOK_COLORS.length]} />,
          );
          bookX += bookWidth + 1;
          index += 1;
        }
        return (
          <g key={y}>
            {books}
            <rect x={x} y={y + 46} width={width} height={6} fill="var(--pb-wood)" />
          </g>
        );
      })}
    </g>
  );
}

/** 図書室：真ん中にアーチの窓が2つ、左右に本棚、窓からの光の筋。人物は置かない */
function Library({ id, time }: { id: string; time: BackdropTime }) {
  const arches = [128, 206];
  return (
    <>
      <defs>
        <linearGradient id={`${id}-shaft`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--pb-light)" stopOpacity="0" />
          <stop offset="0.2" stopColor="var(--pb-light)" stopOpacity="0.4" />
          <stop offset="1" stopColor="var(--pb-light)" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${id}-arch`}>
          {arches.map((x) => (
            <path key={x} d={`M${x} 200V80a33 33 0 0 1 66 0v120z`} />
          ))}
        </clipPath>
      </defs>
      <rect width="400" height="300" fill="var(--pb-wall)" />
      <g clipPath={`url(#${id}-arch)`}>
        <Sky id={id} x={128} y={40} width={144} height={160} time={time} />
      </g>
      {arches.map((x) => (
        <g key={x}>
          <path d={`M${x + 33} 47v153M${x} 110h66M${x} 156h66`} stroke="var(--pb-wood)" strokeWidth="3" fill="none" />
          <path d={`M${x} 200V80a33 33 0 0 1 66 0v120z`} stroke="var(--pb-wood-dark)" strokeWidth="5" fill="none" />
        </g>
      ))}
      <Shelf x={0} width={112} />
      <Shelf x={288} width={112} />
      <rect y="250" width="400" height="50" fill="var(--pb-floor)" />
      <g className="pb-shaft">
        {arches.map((x) => (
          <path key={x} d={`M${x} 90h66l90 210H${x + 50}z`} fill={`url(#${id}-shaft)`} />
        ))}
      </g>
      {[
        [170, 150],
        [222, 210],
        [262, 170],
        [300, 240],
        [196, 250],
      ].map(([x, y], index) => (
        <circle key={x} className="pb-mote" cx={x} cy={y} r={index % 2 === 0 ? 2 : 1.4} fill="var(--pb-light)" style={{ animationDelay: `${-index * 2.3}s` }} />
      ))}
    </>
  );
}

const SCENES: Record<BackdropPlace, (props: { id: string; time: BackdropTime }) => ReactNode> = {
  classroom: Classroom,
  schoolyard: Schoolyard,
  hallway: Hallway,
  library: Library,
};

/** レアな背景の重ね絵。動きは CSS（減らす設定では止まる） */
function RareLayer({ rare }: { rare: BackdropRare }) {
  if (rare === "sakura" || rare === "snow") {
    return (
      <div className="pb-fall">
        {Array.from({ length: rare === "snow" ? 22 : 16 }, (_, i) => (
          <span
            key={i}
            style={{
              left: `${(i * 37 + 5) % 100}%`,
              animationDelay: `${-((i * 1.3) % 9)}s`,
              animationDuration: `${7 + (i % 5)}s`,
              top: `${(i * 23) % 90}%`,
            }}
          />
        ))}
      </div>
    );
  }
  if (rare === "rainbow") {
    return (
      <svg className="pb-rainbow" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        {["#ff6b6b", "#ffa94d", "#ffe066", "#69db7c", "#4dabf7", "#9775fa"].map((color, index) => (
          <path key={color} d={`M${40 + index * 8} 230a${160 - index * 8} ${150 - index * 8} 0 0 1 ${320 - index * 16} 0`} stroke={color} strokeWidth="8" fill="none" />
        ))}
      </svg>
    );
  }
  if (rare === "shooting-star") {
    return (
      <div className="pb-shooting">
        <span />
        <span style={{ animationDelay: "-3.5s", top: "26%", left: "20%" }} />
      </div>
    );
  }
  // 文化祭の飾り：上のふちに三角の旗を2本
  return (
    <svg className="pb-festival" viewBox="0 0 400 60" preserveAspectRatio="none" aria-hidden="true">
      {[0, 1].map((line) => (
        <g key={line} className="pb-bunting" style={{ animationDelay: `${-line * 1.4}s` }}>
          <path d={`M0 ${6 + line * 14}Q200 ${34 + line * 14} 400 ${6 + line * 14}`} stroke="#8a6549" strokeWidth="1.5" fill="none" />
          {Array.from({ length: 12 }, (_, i) => {
            const x = 14 + i * 33 + line * 16;
            const t = x / 400;
            const y = (1 - t) * (1 - t) * (6 + line * 14) + 2 * (1 - t) * t * (34 + line * 14) + t * t * (6 + line * 14);
            return <path key={i} d={`M${x - 8} ${y}h16l-8 14z`} fill={["#ff6b6b", "#ffd43b", "#4dabf7", "#69db7c", "#f783ac"][(i + line * 2) % 5]} />;
          })}
        </g>
      ))}
    </svg>
  );
}

function readOverride() {
  try {
    return parseBackdropParam(new URLSearchParams(window.location.search).get("bg"));
  } catch {
    return {};
  }
}

/** 見たレアを端末に残す（コレクション）。保存できなくても背景には関係ない */
function rememberRare(owner: string, rare: BackdropRare, now: Date) {
  try {
    const key = seenRaresKey(owner);
    const seen = parseSeenRares(window.localStorage.getItem(key));
    window.localStorage.setItem(key, JSON.stringify(addSeenRare(seen, rare, backdropDateKey(now))));
  } catch {
    // 保存できない端末でも、背景は出す
  }
}

/**
 * パートナーの窓の背景（0-2x）。`.lcd` の中の一番下に敷く。時刻（日本時間）で朝・昼・夕・夜、日替わりで場所が変わる。
 * まれにレアな背景が出て、onRare で今の一言の前に添える言葉（「今日は虹が出てるよ。」）を本体へ渡し、コレクション（端末）に残す。
 * `?bg=night` `?bg=library` `?bg=rare-snow` などで固定できる（撮影・画面テスト用）。
 */
export function PartnerBackdrop({ owner, role, onRare }: { owner: string; role?: string; onRare?: (prefix: string) => void }) {
  const id = `pb${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [backdrop, setBackdrop] = useState<Backdrop | null>(null);
  const rareRef = useRef(onRare);
  useEffect(() => {
    rareRef.current = onRare;
  }, [onRare]);
  const announced = useRef<BackdropRare | null>(null);

  useEffect(() => {
    const override = readOverride();
    const update = () => {
      const next = pickBackdrop(new Date(), override);
      setBackdrop((prev) => (prev && prev.time === next.time && prev.place === next.place && prev.rare === next.rare ? prev : next));
    };
    update();
    const timer = setInterval(update, CHECK_MS);
    return () => clearInterval(timer);
  }, []);

  const rare = backdrop?.rare ?? null;
  useEffect(() => {
    if (!rare || announced.current === rare) return;
    announced.current = rare;
    rememberRare(owner, rare, new Date());
    rareRef.current?.(rarePrefix(rare, role));
  }, [rare, owner, role]);

  if (!backdrop) return null;
  const Scene = SCENES[backdrop.place];
  return (
    <div className="partner-backdrop" data-time={backdrop.time} data-place={backdrop.place} data-rare={backdrop.rare ?? undefined} aria-hidden="true">
      <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--pb-sky-top)" />
            <stop offset="1" stopColor="var(--pb-sky-bottom)" />
          </linearGradient>
        </defs>
        <Scene id={id} time={backdrop.time} />
        <rect width="400" height="300" fill="var(--pb-tint)" />
      </svg>
      {backdrop.rare && <RareLayer rare={backdrop.rare} />}
    </div>
  );
}
