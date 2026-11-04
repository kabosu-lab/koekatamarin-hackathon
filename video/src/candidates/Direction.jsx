/* 動画の方向の試作（20秒・60コマ）：声のかたまりが主役。話す→つながる→たまる→増える→広がる
   P ポップ、Q 実画面、R ジャズの切り絵。動きは同じで、色、形、音楽が違う。120 BPM の拍に合わせている */
import { AbsoluteFill, Audio, Img, random, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import REG from "./regions.json";
import { GOTHIC, MINCHO, lerp, smooth } from "./shared";

export const DIRECTION_FRAMES = 1200;
const STARTS = [0, 270, 480, 720, 900, 1050];
const WIPE_FROM = [[960, 540], [1860, 470], [960, 540], [1300, 560], [960, 540], [960, 540]];
const INK = "#1d1b26", PAPER = "#f3ead7", RED = "#d9432b", BLACK = "#1c1b1f";

const orange = "radial-gradient(circle at 34% 28%, #fff1c9 0%, #ffb000 26%, #ff7f45 58%, #ff5a3c 100%)";
const THEMES = {
  P: {
    music: "direction-p.wav", head: GOTHIC, headWeight: 900, radius: 999,
    stage: [["#ff5a3c", "#fff"], ["#1f9dff", "#fff"], ["#7a5cff", "#fff"], ["#12c28a", "#08312a"], ["#ffb000", "#2a1c00"], ["#ff5a3c", "#fff"]],
    chip: () => ["#fff", INK], lump: "radial-gradient(circle at 34% 28%, #fff 0%, #fff3c4 45%, #ffd24a 100%)", box: ["#fff", INK], person: ["#fff", "#ffe08a", "#ffd0c7"],
  },
  Q: {
    music: "direction-q.wav", head: GOTHIC, headWeight: 800, radius: 28, phone: true,
    stage: [["#fff1e8", INK], ["#e8f4ff", INK], ["#f0ecff", INK], ["#e4faf1", INK], ["#fff6da", INK], ["#fff1e8", INK]],
    chip: i => [["#ff5a3c", "#1f9dff", "#7a5cff", "#12c28a", "#e08a00"][i % 5], "#fff"], lump: orange, box: ["#fff", INK], person: ["#ff5a3c", "#1f9dff", "#12c28a"],
  },
  R: {
    music: "direction-r.wav", head: MINCHO, headWeight: 700, radius: 6,
    stage: [[PAPER, BLACK], [RED, PAPER], [PAPER, BLACK], [BLACK, PAPER], [PAPER, BLACK], [RED, PAPER]],
    chip: (i, st) => (st === 1 ? [BLACK, PAPER] : st === 3 ? [i % 3 ? PAPER : RED, i % 3 ? BLACK : PAPER] : [i % 2 ? RED : BLACK, PAPER]), lump: null, box: ["#fffaf0", BLACK], person: [PAPER, PAPER, PAPER],
  },
  /* P の色のまま、文字と動きを整える。かたまりが広がって次の色になり、最後は枠を越える */
  U: {
    music: "direction-p.wav", head: GOTHIC, headWeight: 900, headSize: 124, tight: "-.025em", radius: 999, bloom: "#fff3c4", cross: true, endLine: "さあ、声で越えよう。",
    dots: ["#fff", "#ff5a3c", "#fff3c4", "#2a1c00"],
    stage: [["#ff5a3c", "#fff"], ["#1f9dff", "#fff"], ["#7a5cff", "#fff"], ["#12c28a", "#08312a"], ["#ffb000", "#2a1c00"], ["#ff5a3c", "#fff"]],
    chip: () => ["#fff", INK], lump: "radial-gradient(circle at 34% 28%, #fff 0%, #fff3c4 45%, #ffd24a 100%)", box: ["#fff", INK], person: ["#fff", "#ffe08a", "#ffd0c7"], check: "#12c28a",
  },
  /* P を軸に、おしゃれへ。S：色を絞った大きな文字。T：動くグラデーションとガラス */
  S: {
    music: "direction-p.wav", head: GOTHIC, headWeight: 900, headSize: 128, tight: "-.03em", radius: 999, flat: true, dots: ["#2b3cff", "#ff4b33", "#111218", "#fff"],
    stage: [["#2b3cff", "#fff"], ["#ff4b33", "#fff"], ["#111218", "#d8ff3e"], ["#d8ff3e", "#111218"], ["#ffc6e0", "#111218"], ["#111218", "#fff"]],
    chip: (i, st) => [[["#d8ff3e", "#111218"], ["#fff", "#2b3cff"]], [["#111218", "#fff"], ["#ffc6e0", "#111218"]], [["#fff", "#111218"], ["#fff", "#111218"]], [["#111218", "#d8ff3e"], ["#2b3cff", "#fff"]]][Math.min(st, 3)][i % 2],
    lumps: ["#d8ff3e", "#fff", "#d8ff3e", "#111218", "#111218"], box: ["#fff", "#111218"], person: ["#fff", "#111218", "#ffc6e0"], check: "#2b3cff",
  },
  T: {
    music: "direction-r.wav", head: GOTHIC, headWeight: 700, headSize: 120, tight: "-.02em", radius: 999, glass: true, dots: ["#fff", "#ffe2f1", "#d9e6ff", "#fff3d6"],
    stage: [["#4b2bff", "#fff"], ["#d6249f", "#fff"], ["#0d6efd", "#fff"], ["#6a11cb", "#fff"], ["#ff5e62", "#fff"], ["#15121f", "#fff"]],
    aurora: [["#4b2bff", "#ff4f9a", "#22d3ee"], ["#d6249f", "#ff9a3c", "#7c3aed"], ["#0d6efd", "#22e6c2", "#8b5cf6"], ["#6a11cb", "#ff5fa2", "#2dd4ff"], ["#ff5e62", "#ffc14d", "#c026d3"], ["#15121f", "#5b2bff", "#ff3d9a"]],
    chip: () => ["rgba(255,255,255,.2)", "#fff"], lump: "radial-gradient(circle at 36% 30%, #fff 0%, #fff 30%, rgba(255,255,255,.75) 62%, rgba(255,255,255,.25) 100%)", box: ["rgba(255,255,255,.18)", "#fff"], person: ["rgba(255,255,255,.9)", "rgba(255,255,255,.9)", "rgba(255,255,255,.9)"], check: "rgba(255,255,255,.3)",
  },
};

const WORDS = [{ at: 30, x: 320, y: 390, t: "作文の書き出し、" }, { at: 60, x: 800, y: 390, t: "声に出して" }, { at: 90, x: 310, y: 540, t: "読ませてみたら" }, { at: 105, x: 720, y: 540, t: "みんな" }, { at: 135, x: 470, y: 690, t: "書けました！" }];
const SENT = "作文の書き出し、声に出して読ませてみたら、みんな書けました！";
const GATHER = 160, INTO = 192, HIT = 210, OUT = 240, SHOOT = 252;
const LUMP = { x: 500, y: 540 };

const bouncy = (f, at, fps, k = {}) => (f < at ? 0 : spring({ frame: f - at, fps, config: { damping: 10, stiffness: 210, mass: .7, ...k } }));
const lumpBg = (T, st) => T.lumps?.[st] ?? T.lump ?? (T.stage[st][0] === RED ? PAPER : T.stage[st][0] === BLACK ? RED : BLACK);

const bgOf = (T, i, f) => { if (!T.aurora) return T.stage[i][0]; const [a, b, c] = T.aurora[i], t = f / 90; return `radial-gradient(60% 70% at ${30 + Math.sin(t) * 18}% ${30 + Math.cos(t * 1.3) * 18}%, ${b} 0%, transparent 70%), radial-gradient(55% 65% at ${72 + Math.cos(t * .8) * 18}% ${70 + Math.sin(t * 1.1) * 16}%, ${c} 0%, transparent 72%), ${a}`; };
const Wipes = ({ f, T }) => <>
  <AbsoluteFill style={{ background: bgOf(T, 0, f) }} />
  {STARTS.slice(1).map((s, i) => {
    const r = lerp(f, s - 14, s + 8, 0, 2300, smooth), [x, y] = WIPE_FROM[i + 1];
    if (r <= 0) return null;
    return <AbsoluteFill key={s}>
      {T.bloom && <AbsoluteFill style={{ background: T.bloom, clipPath: `circle(${lerp(f, s - 20, s + 4, 0, 2300, smooth)}px at ${x}px ${y}px)` }} />}
      <AbsoluteFill style={{ background: bgOf(T, i + 1, f), clipPath: `circle(${r}px at ${x}px ${y}px)` }} />
    </AbsoluteFill>;
  })}
</>;

const Head = ({ f, T, st, at, big, small }) => {
  const s = bouncy(f, at + 2, 60, { damping: 13, stiffness: 170 });
  return <div style={{ position: "absolute", left: 100, top: 70, color: T.stage[st][1], fontFamily: T.head, transform: `translateY(${(1 - s) * 40}px)`, opacity: Math.min(1, s * 1.4) }}>
    <div style={{ fontWeight: T.headWeight, fontSize: T.headSize ?? 104, lineHeight: 1.15, letterSpacing: T.tight ?? ".01em" }}>{big}</div>
    <div style={{ fontFamily: GOTHIC, fontWeight: 600, fontSize: 42, marginTop: 8, opacity: .95 }}>{small}</div>
  </div>;
};

const Chip = ({ T, st, i, children, style, size = 56 }) => { const [bg, fg] = T.chip(i, st); return <div style={{ position: "absolute", transform: "translate(-50%,-50%)", background: bg, color: fg, fontFamily: GOTHIC, fontWeight: 800, fontSize: size, lineHeight: 1, padding: `${size * .46}px ${size * .62}px`, borderRadius: T.radius, whiteSpace: "nowrap", boxShadow: T.flat || T.glass || T.radius <= 10 ? "none" : "0 14px 36px rgba(20,10,40,.18)", ...(T.glass ? { border: "1.5px solid rgba(255,255,255,.55)" } : {}), ...style }}>{children}</div>; };
const Blob = ({ T, st, x, y, sx = 1, sy = 1, rot = 0, opacity = 1, d = 190 }) => <div style={{ position: "absolute", left: x - d / 2, top: y - d / 2, width: d, height: d, borderRadius: "50%", opacity, transform: `rotate(${rot}deg) scale(${sx},${sy})`, background: lumpBg(T, st), boxShadow: T.glass ? "0 0 70px 14px rgba(255,255,255,.55)" : T.lump && !T.flat ? "0 18px 50px rgba(40,20,0,.22)" : "none" }} />;

/* 箱：言葉のかたまりが入ると文章に開き、つぶれて、もう一度かたまりになって飛び出す */
const BOX = { x: 1010, y: 300, w: 760, h: 380 };
const boxCenter = (T) => {
  if (!T.phone) return { x: BOX.x + BOX.w / 2, y: BOX.y + BOX.h / 2 };
  const r = REG["phone-5-draft"].main, k = .93;
  return { x: PHONE.x + (r.x + r.w / 2) * k, y: PHONE.y + (r.y + Math.min(r.h, 130) / 2) * k };
};
const PHONE = { x: 1240, y: 110 };
const boxBump = (f) => { const hit = bouncy(f, HIT, 60, { damping: 7, stiffness: 320, mass: .6 }), press = lerp(f, OUT - 16, OUT, 0, 1, smooth), rel = bouncy(f, OUT, 60, { damping: 8, stiffness: 300 }); return { sx: 1 + (f >= HIT ? (1 - hit) * .05 : 0) + press * .05 * (1 - rel), sy: 1 + (f >= HIT ? (1 - hit) * -.07 : 0) - press * .14 * (1 - rel) }; };

const TextBox = ({ f, T }) => {
  const c = boxBump(f), appear = bouncy(f, 150, 60, { damping: 14, stiffness: 140 }), filled = f >= HIT, gone = lerp(f, OUT - 4, OUT + 6, 1, 0);
  const shown = filled ? SENT.slice(0, Math.floor(lerp(f, HIT, HIT + 14, 0, SENT.length))) : "";
  if (T.phone) return <div style={{ position: "absolute", left: PHONE.x, top: PHONE.y, width: 412 * .93, height: 860 * .93, transform: `translateX(${(1 - appear) * 700}px) scale(${c.sx},${c.sy})`, borderRadius: 46, overflow: "hidden", boxShadow: "0 30px 90px rgba(40,30,80,.22)", outline: "10px solid #1d1b26" }}>
    <Img src={staticFile(`app/${filled && f < OUT + 4 ? "phone-5-draft" : "phone-1-idle"}.png`)} style={{ width: "100%", height: "100%" }} />
  </div>;
  return <div style={{ position: "absolute", left: BOX.x, top: BOX.y, width: BOX.w, height: BOX.h, transform: `translateX(${(1 - appear) * 1000}px) scale(${c.sx},${c.sy})`, background: T.box[0], color: T.box[1], borderRadius: T.radius > 10 ? 44 : 4, padding: 48, boxSizing: "border-box", boxShadow: T.flat || T.glass ? "none" : T.radius > 10 ? "0 26px 70px rgba(30,20,60,.22)" : `14px 14px 0 ${BLACK}`, border: T.glass ? "1.5px solid rgba(255,255,255,.55)" : T.radius > 10 ? "none" : `4px solid ${BLACK}` }}>
    <div style={{ fontFamily: GOTHIC, fontWeight: 700, fontSize: 28, opacity: .55, marginBottom: 20 }}>AI が、言葉にしました</div>
    <div style={{ fontFamily: GOTHIC, fontWeight: 700, fontSize: 46, lineHeight: 1.45, opacity: gone }}>{shown}</div>
  </div>;
};

const Speak = ({ f, T, fps }) => {
  const C = boxCenter(T);
  const born = bouncy(f, GATHER + 10, fps, { damping: 8, stiffness: 170 });
  const into = lerp(f, INTO, HIT, 0, 1, t => t * t), pull = lerp(f, OUT, SHOOT, 0, 1, smooth), fly = lerp(f, SHOOT, 272, 0, 1, t => t * t);
  let lump = null;
  if (f >= GATHER + 10 && f < HIT) {
    const x = LUMP.x + (C.x - LUMP.x) * into, y = LUMP.y + (C.y - LUMP.y) * into - Math.sin(into * Math.PI) * 130;
    lump = <Blob T={T} st={0} x={x} y={y} sx={born * (1 + into * .5)} sy={born * (1 - into * .25)} />;
  }
  if (f >= OUT && f < 272) {
    const e = bouncy(f, OUT, fps, { damping: 9, stiffness: 240 }), x = C.x - pull * 40 + fly * (1960 - C.x), y = C.y - fly * 40;
    lump = <>{fly > 0 && [10, 8, 6, 4, 2].map(b => { const k = lerp(f - b, SHOOT, 272, 0, 1, t => t * t); return <Blob key={b} T={T} st={0} x={C.x - 40 + k * (1960 - C.x)} y={C.y - k * 40} sx={e * (1 + k) * (1 - b * .05)} sy={e * (1 - k * .6) * (1 - b * .05)} opacity={.14 * (11 - b) / 6} />; })}<Blob T={T} st={0} x={x} y={y} sx={e * (1 - pull * .18 + fly * 1.3)} sy={e * (1 + pull * .2 - fly * .75)} /></>;
  }
  return <>
    <TextBox f={f} T={T} />
    {WORDS.map((w, i) => {
      const g = lerp(f, GATHER + i * 2, GATHER + 26 + i * 2, 0, 1, t => t * t * t), s = bouncy(f, w.at, fps);
      if (f < w.at || g >= 1) return null;
      return <Chip key={w.at} T={T} st={0} i={i} style={{ left: w.x + (LUMP.x - w.x) * g, top: w.y + (LUMP.y - w.y) * g, transform: `translate(-50%,-50%) scale(${s * (1 - g * .8)}) rotate(${(1 - s) * -8}deg)` }}>{w.t}</Chip>;
    })}
    {lump}
  </>;
};

const PEOPLE = [[720, 620, "やってみます！", 330], [1180, 520, "それ、教えて！", 372], [1600, 690, "ありがとう！", 414]];
const Connect = ({ f, T, fps }) => {
  const seg = [[-100, 560], ...PEOPLE.map(p => [p[0], p[1]])], times = [282, 320, 362, 404];
  const idx = times.findIndex((t, i) => f < times[i + 1]), cur = idx < 0 ? times.length - 2 : idx, k = lerp(f, times[cur], times[cur + 1], 0, 1, t => t * t), [a, b] = [seg[cur], seg[cur + 1]];
  return <>
    {T.phone && <div style={{ position: "absolute", left: 120, top: 330, width: 700, height: 500, overflow: "hidden", borderRadius: 26, boxShadow: "0 26px 70px rgba(30,40,90,.18)", transform: `scale(${bouncy(f, 276, fps, { damping: 14 })})` }}>
      <Img src={staticFile("app/teams-2-replied.png")} style={{ position: "absolute", width: 1100, left: -300, top: -(REG["teams-2-replied"].main.y * .86) + 10 }} />
    </div>}
    <svg width="1920" height="1080" style={{ position: "absolute" }}>
      {PEOPLE.slice(0, -1).map((p, i) => { const n = PEOPLE[i + 1], g = lerp(f, times[i + 1], times[i + 2], 0, 1, smooth); return <line key={i} x1={p[0]} y1={p[1]} x2={p[0] + (n[0] - p[0]) * g} y2={p[1] + (n[1] - p[1]) * g} stroke={T.stage[1][1]} strokeWidth="8" strokeLinecap="round" opacity=".55" />; })}
    </svg>
    {PEOPLE.map((p, i) => { const s = bouncy(f, 276 + i * 8, fps), hit = bouncy(f, times[i + 1], fps, { damping: 6, stiffness: 330, mass: .6 }), bump = f >= times[i + 1] ? 1 + (1 - hit) * .28 : 1; return <div key={i} style={{ position: "absolute", left: p[0] - 70, top: p[1] - 70, width: 140, height: 140, borderRadius: T.radius > 10 ? "50%" : 4, background: T.person[i], transform: `scale(${s * bump})`, boxShadow: T.flat ? "none" : T.glass ? "0 0 50px 8px rgba(255,255,255,.5)" : "0 14px 36px rgba(20,10,40,.18)" }} />; })}
    {PEOPLE.map((p, i) => { const s = bouncy(f, p[3], fps); return f >= p[3] ? <Chip key={i} T={T} st={1} i={i + 1} size={38} style={{ left: p[0], top: p[1] - 130, transform: `translate(-50%,-50%) scale(${s})` }}>{p[2]}</Chip> : null; })}
    {f < 404 && <Blob T={T} st={1} d={90} x={a[0] + (b[0] - a[0]) * k} y={a[1] + (b[1] - a[1]) * k - Math.sin(k * Math.PI) * 70} sx={1 + k * .5} sy={1 - k * .3} />}
  </>;
};

const KNOW = ["作文の書き出し", "面談で待つ間合い", "叱る前の一呼吸", "声のかけどき", "質問を待つ沈黙", "3D プリンタの勘", "手が止まる瞬間", "授業の空気を読む", "出張の出し方"];
const Pile = ({ f, T, fps }) => <>{KNOW.map((t, i) => {
  const at = 496 + i * 15, s = bouncy(f, at, fps, { damping: 12, stiffness: 200 }), checked = f >= at + 45 && i % 3 !== 2, c = bouncy(f, at + 45, fps);
  const x = 690 + (i % 3) * 400, y = 300 + Math.floor(i / 3) * 215;
  return f >= at ? <div key={t} style={{ position: "absolute", left: x, top: y, width: 370, height: 180, transform: `translateY(${(1 - s) * -520}px) rotate(${(1 - s) * (i % 2 ? 7 : -7)}deg)`, background: T.box[0], color: T.box[1], borderRadius: T.radius > 10 ? 26 : 4, padding: 26, boxSizing: "border-box", boxShadow: T.flat || T.glass ? "none" : T.radius > 10 ? "0 16px 40px rgba(30,20,70,.2)" : `8px 8px 0 ${BLACK}`, border: T.glass ? "1.5px solid rgba(255,255,255,.55)" : T.radius > 10 ? "none" : `3px solid ${BLACK}`, fontFamily: GOTHIC }}>
    <div style={{ fontWeight: 800, fontSize: 36 }}>{t}</div>
    {checked && <div style={{ display: "inline-block", marginTop: 22, fontWeight: 700, fontSize: 25, color: "#fff", background: T.check ?? (T.radius > 10 ? "#12c28a" : RED), padding: "7px 18px", borderRadius: T.radius > 10 ? 99 : 2, transform: `scale(${c})`, transformOrigin: "left center" }}>✓ {i % 3 + 2}人が確かめた</div>}
  </div> : null;
})}</>;

const SKILLS = ["作文", "面談", "英語", "実験", "部活", "進路", "3D", "声かけ"];
const Grow = ({ f, T, fps }) => {
  const size = lerp(f, 730, 880, .7, 1.25, smooth), turn = f / 170;
  return <>
    <Blob T={T} st={3} x={1250} y={590} d={230} sx={size * bouncy(f, 722, fps)} sy={size * bouncy(f, 722, fps)} />
    {SKILLS.map((t, i) => { const at = 738 + i * 15, s = bouncy(f, at, fps), a = i / 8 * Math.PI * 2 + turn, r = 340; return f >= at ? <Chip key={t} T={T} st={3} i={i} size={44} style={{ left: 1250 + Math.cos(a) * r * 1.2, top: 590 + Math.sin(a) * r * .95, transform: `translate(-50%,-50%) scale(${s})` }}>{t}</Chip> : null; })}
  </>;
};

const NODES = Array.from({ length: 70 }).map((_, i) => { const a = random(`a${i}`) * 6.283, r = 80 + random(`r${i}`) * 1050; return { x: 960 + Math.cos(a) * r, y: 620 + Math.sin(a) * r * .5, r, d: 14 + random(`d${i}`) * 26 }; });
/* 点と線をやめ、丸が画面いっぱいに広がる */
const Dots = ({ f, T }) => { const k = lerp(f, 900, 1040, 0, 1500, t => 1 - (1 - t) ** 2); return <>{Array.from({ length: 16 * 9 }).map((_, i) => { const x = 60 + (i % 16) * 120, y = 60 + Math.floor(i / 16) * 120, d = Math.hypot(x - 960, y - 600), s = lerp(k, d, d + 240, 0, 1, smooth), c = T.dots[(i * 7 + Math.floor(i / 16) * 3) % T.dots.length]; return s > 0 && !(y < 300 && x < 1060) ? <div key={i} style={{ position: "absolute", left: x - 42, top: y - 42, width: 84, height: 84, borderRadius: "50%", background: c, opacity: T.glass ? .32 + (i % 5) * .1 : 1, transform: `scale(${s * (.55 + ((i * 13) % 7) / 14)})` }} /> : null; })}</>; };
/* 学校の枠を、かたまりがポンと越えて、外に丸が広がる */
const FRAME = { x: 700, y: 430, w: 520, h: 360 };
const Cross = ({ f, T, fps }) => {
  const c = T.stage[4][1], s = bouncy(f, 904, fps, { damping: 13, stiffness: 170 }), jump = lerp(f, 936, 962, 0, 1, t => t * t), hit = bouncy(f, 950, fps, { damping: 6, stiffness: 320, mass: .6 }), bump = f >= 950 ? 1 + (1 - hit) * .06 : 1;
  const x = 960 + jump * 760, y = 610 - jump * 330 - Math.sin(jump * Math.PI) * 150, k = lerp(f, 950, 1040, 0, 1500, t => 1 - (1 - t) ** 2);
  return <>
    {Array.from({ length: 16 * 9 }).map((_, i) => { const dx = 60 + (i % 16) * 120, dy = 60 + Math.floor(i / 16) * 120, d = Math.hypot(dx - 1720, dy - 280), g = lerp(k, d, d + 240, 0, 1, smooth), inside = dx > FRAME.x - 50 && dx < FRAME.x + FRAME.w + 50 && dy > FRAME.y - 50 && dy < FRAME.y + FRAME.h + 50; return g > 0 && !inside && !(dy < 300 && dx < 1240) ? <div key={i} style={{ position: "absolute", left: dx - 42, top: dy - 42, width: 84, height: 84, borderRadius: "50%", background: T.dots[(i * 7 + Math.floor(i / 16) * 3) % T.dots.length], transform: `scale(${g * (.55 + ((i * 13) % 7) / 14)})` }} /> : null; })}
    <div style={{ position: "absolute", left: FRAME.x, top: FRAME.y, width: FRAME.w, height: FRAME.h, border: `10px solid ${c}`, borderRadius: 40, boxSizing: "border-box", transform: `scale(${s * bump})`, display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 26, fontFamily: GOTHIC, fontWeight: 900, fontSize: 56, color: c }}>学校</div>
    {f >= 904 && f < 1040 && <Blob T={T} st={4} x={x} y={y} d={130} sx={s * (1 + jump * .35)} sy={s * (1 - jump * .15)} />}
  </>;
};
const Spread = ({ f, T, fps }) => {
  if (T.cross) return <Cross f={f} T={T} fps={fps} />;
  if (T.dots) return <Dots f={f} T={T} />;
  const reach = lerp(f, 900, 1050, 0, 1150, t => 1 - (1 - t) ** 2), c = T.stage[4][1];
  return <>
    <svg width="1920" height="1080" style={{ position: "absolute" }}>
      {NODES.map((n, i) => { const on = n.r < reach, m = NODES[(i * 7 + 3) % 70]; return on && m.r < reach ? <line key={i} x1={n.x} y1={n.y} x2={m.x} y2={m.y} stroke={c} strokeWidth="3" opacity=".22" /> : null; })}
    </svg>
    {NODES.map((n, i) => { const s = lerp(reach, n.r, n.r + 90, 0, 1, smooth); return s > 0 ? <div key={i} style={{ position: "absolute", left: n.x - n.d / 2, top: n.y - n.d / 2, width: n.d, height: n.d, borderRadius: T.radius > 10 ? "50%" : 2, background: c, transform: `scale(${s})` }} /> : null; })}
  </>;
};

const Title = ({ f, T, fps }) => {
  const s = bouncy(f, 1056, fps, { damping: 9, stiffness: 180 }), c = T.stage[5][1], sub = bouncy(f, 1095, fps, { damping: 14, stiffness: 150 });
  return <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", color: c }}>
    <div style={{ fontFamily: T.head, fontWeight: T.headWeight, fontSize: 230, letterSpacing: ".06em", lineHeight: 1.1, transform: `scale(${s})` }}>こえかた</div>
    <div style={{ fontFamily: GOTHIC, fontWeight: T.endLine ? 900 : 700, fontSize: T.endLine ? 84 : 52, letterSpacing: T.tight ?? 0, marginTop: 30, transform: `translateY(${(1 - sub) * 30}px)`, opacity: Math.min(1, sub * 1.3) }}>{T.endLine ?? "話すだけで、AI と仲間の力を借りて、もっといい仕事を。"}</div>
  </AbsoluteFill>;
};

const HEADS = [[0, "話す。", "言葉にならない経験を、声で拾う。"], [1, "つながる。", "人に届いて、助け合う。"], [2, "たまる。", "言葉にならなかった経験が、校内の知恵になる。"], [3, "できることが、増える。", "次の人は、もっと早く、もっとよく。"], [4, "広がる。", "これから、学校を越えて、地域や企業へ。"]];
const Direction = ({ kind }) => {
  const f = useCurrentFrame(), { fps } = useVideoConfig(), T = THEMES[kind];
  const st = STARTS.reduce((a, s, i) => (f >= s ? i : a), 0);
  return <AbsoluteFill style={{ overflow: "hidden" }}>
    <Wipes f={f} T={T} />
    {st === 0 && <Speak f={f} T={T} fps={fps} />}
    {st === 1 && <Connect f={f} T={T} fps={fps} />}
    {st === 2 && <Pile f={f} T={T} fps={fps} />}
    {st === 3 && <Grow f={f} T={T} fps={fps} />}
    {st === 4 && <Spread f={f} T={T} fps={fps} />}
    {st === 5 && <Title f={f} T={T} fps={fps} />}
    {st < 5 && <Head f={f} T={T} st={st} at={STARTS[st]} big={HEADS[st][1]} small={HEADS[st][2]} />}
    <Audio src={staticFile(T.music)} />
  </AbsoluteFill>;
};
export const DirectionP = () => <Direction kind="P" />;
export const DirectionQ = () => <Direction kind="Q" />;
export const DirectionR = () => <Direction kind="R" />;
export const DirectionU = () => <Direction kind="U" />;
export const DirectionS = () => <Direction kind="S" />;
export const DirectionT = () => <Direction kind="T" />;
