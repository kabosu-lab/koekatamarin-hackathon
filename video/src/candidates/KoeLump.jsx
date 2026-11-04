/* 声のかたまり：話した言葉がポポポと出て、固まって、シューンと飛び、相手に届いて開く。60コマで動かす */
import { AbsoluteFill, Audio, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { GOTHIC, lerp, smooth } from "./shared";

export const LUMP_FRAMES = 420;
const CORAL = "#ff5a3c", SUN = "#ffb000", SKY = "#1f9dff", MINT = "#12c28a", VIOLET = "#7a5cff", INK = "#1d1b26";
const WORDS = [
  { at: 20, x: 330, y: 330, text: "作文の書き出し、", color: CORAL },
  { at: 46, x: 850, y: 330, text: "声に出して", color: SKY },
  { at: 72, x: 320, y: 520, text: "読ませてみたら", color: VIOLET },
  { at: 98, x: 760, y: 520, text: "みんな", color: MINT },
  { at: 124, x: 480, y: 710, text: "書けました！", color: SUN },
];
const GATHER = 165, PULL = 205, FLY = 226, HIT = 250;
const LUMP = { x: 520, y: 540 }, TARGET = { x: 1470, y: 440 };

/* かたまりの位置：引いて、弧を描いて飛ぶ */
function lumpAt(f) {
  const back = lerp(f, PULL, FLY, 0, 1, smooth);
  const k = lerp(f, FLY, HIT, 0, 1, t => t * t);
  return { x: LUMP.x - back * 90 + (TARGET.x - LUMP.x + 90) * k, y: LUMP.y + back * 14 + (TARGET.y - LUMP.y - 14) * k - Math.sin(k * Math.PI) * 170 };
}

const Word = ({ w, f, fps }) => {
  const s = spring({ frame: f - w.at, fps, config: { damping: 9, stiffness: 210, mass: .7 } });
  const g = lerp(f, GATHER + (w.at - 20) / 8, GATHER + 28 + (w.at - 20) / 8, 0, 1, t => t * t * t);
  if (f < w.at || g >= 1) return null;
  const x = w.x + (LUMP.x - w.x) * g, y = w.y + (LUMP.y - w.y) * g + Math.sin(f / 22 + w.at) * 5 * (1 - g);
  return <div style={{ position: "absolute", left: x, top: y, transform: `translate(-50%,-50%) scale(${s * (1 - g * .75)}) rotate(${(1 - s) * -8}deg)`, background: w.color, color: "#fff", fontFamily: GOTHIC, fontWeight: 800, fontSize: 64, lineHeight: 1, padding: "30px 40px", borderRadius: 999, whiteSpace: "nowrap", boxShadow: `0 16px 40px ${w.color}55` }}>{w.text}</div>;
};

const Blob = ({ x, y, sx, sy, rot = 0, opacity = 1, d = 230 }) => <div style={{ position: "absolute", left: x - d / 2, top: y - d / 2, width: d, height: d, borderRadius: "50%", opacity, transform: `rotate(${rot}deg) scale(${sx},${sy})`, background: `radial-gradient(circle at 34% 28%, #fff1c9 0%, ${SUN} 26%, #ff7f45 58%, ${CORAL} 100%)`, boxShadow: `0 20px 60px ${CORAL}55` }} />;

const Lump = ({ f, fps }) => {
  if (f < GATHER + 14 || f >= HIT) return null;
  const born = spring({ frame: f - GATHER - 14, fps, config: { damping: 8, stiffness: 170 } });
  const back = lerp(f, PULL, FLY, 0, 1, smooth), k = lerp(f, FLY, HIT, 0, 1, t => t * t);
  const sx = 1 - back * .2 + k * 1.1, sy = 1 + back * .22 - k * .78;
  const p = lumpAt(f), q = lumpAt(f + 1), rot = k > 0 ? Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI : 0;
  return <>
    {k > 0 && [10, 8, 6, 4, 2].map(b => { const t = lumpAt(f - b); return <Blob key={b} x={t.x} y={t.y} sx={sx * born * (1 - b * .05)} sy={sy * born * (1 - b * .05)} rot={rot} opacity={.13 * (11 - b) / 6} />; })}
    <Blob x={p.x} y={p.y} sx={sx * born} sy={sy * born} rot={rot} />
  </>;
};

const Burst = ({ f }) => {
  if (f < HIT || f > HIT + 50) return null;
  const k = lerp(f, HIT, HIT + 50, 0, 1, t => 1 - (1 - t) ** 3), colors = [CORAL, SUN, MINT, SKY, VIOLET];
  return <>{Array.from({ length: 22 }).map((_, i) => { const a = i / 22 * Math.PI * 2, r = 60 + (i % 3 + 1) * 130 * k; return <div key={i} style={{ position: "absolute", left: TARGET.x + Math.cos(a) * r, top: TARGET.y + Math.sin(a) * r * .75, width: 18, height: 18, borderRadius: "50%", background: colors[i % 5], opacity: 1 - k, transform: `scale(${1 - k * .6})` }} />; })}</>;
};

const Person = ({ name, color }) => <div style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: GOTHIC, fontWeight: 700, fontSize: 26, color: INK }}><span style={{ width: 44, height: 44, borderRadius: "50%", background: color }} />{name}</div>;
const Pop = ({ f, at, fps, children, origin = "left center" }) => { const s = spring({ frame: f - at, fps, config: { damping: 10, stiffness: 220, mass: .7 } }); return <div style={{ transform: `scale(${f < at ? 0 : s})`, transformOrigin: origin }}>{children}</div>; };

const Card = ({ f, fps }) => {
  const s = spring({ frame: f - 150, fps, config: { damping: 15, stiffness: 120 } }), hit = spring({ frame: f - HIT, fps, config: { damping: 7, stiffness: 300, mass: .6 } });
  const bump = f >= HIT ? 1 + (1 - hit) * .07 : 1;
  return <div style={{ position: "absolute", left: 1130, top: 190, width: 680, minHeight: 680, transform: `translateX(${(1 - s) * 760}px) scale(${bump})`, background: "#fff", borderRadius: 40, padding: 44, boxShadow: "0 30px 90px rgba(40,30,80,.14)", boxSizing: "border-box" }}>
    <div style={{ fontFamily: GOTHIC, fontWeight: 800, fontSize: 30, color: "#8b8798", marginBottom: 30 }}>校内チャット</div>
    <Pop f={f} at={HIT} fps={fps}>
      <Person name="佐伯 みどり" color={CORAL} />
      <div style={{ fontFamily: GOTHIC, fontWeight: 600, fontSize: 40, lineHeight: 1.5, color: INK, margin: "18px 0 30px" }}>作文の書き出し、声に出して読ませてみたら、みんな書けました！</div>
    </Pop>
    <div style={{ display: "flex", gap: 14, marginBottom: 26 }}>
      {[["いいね 3", CORAL, HIT + 34], ["すごい 2", SKY, HIT + 46]].map(([t, c, at]) => <Pop key={t} f={f} at={at} fps={fps}><span style={{ display: "inline-block", fontFamily: GOTHIC, fontWeight: 800, fontSize: 26, color: "#fff", background: c, borderRadius: 999, padding: "10px 24px" }}>{t}</span></Pop>)}
    </div>
    <Pop f={f} at={HIT + 66} fps={fps}><div style={{ marginBottom: 20 }}><Person name="大河原 誠" color={SKY} /><div style={{ fontFamily: GOTHIC, fontSize: 30, fontWeight: 500, color: INK, marginTop: 8, marginLeft: 58 }}>次の授業でやってみます！</div></div></Pop>
  </div>;
};

export const KoeLumpTest = () => {
  const f = useCurrentFrame(), { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: "#fff8ec", overflow: "hidden" }}>
      <Card f={f} fps={fps} />
      {WORDS.map(w => <Word key={w.at} w={w} f={f} fps={fps} />)}
      <Lump f={f} fps={fps} />
      <Burst f={f} />
      <Audio src={staticFile("koe-lump.wav")} />
    </AbsoluteFill>
  );
};
