/* 3分の全編（下書き）。試作 U の色と動き。主役は分身と声のかたまり。実画面は本物を撮ったもの */
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Blob, bouncy, Chip, Cross, Grow, THEMES } from "./Direction";
import TL from "./timeline.json";
import R from "./repo-facts.json";
import REG from "./regions.json";
import TAKE from "./take.json";
import { GOTHIC, lerp, smooth } from "./shared";

const T = THEMES.U, FPS = 60;
const COLORS = [["#ff5a3c", "#fff"], ["#1f9dff", "#fff"], ["#7a5cff", "#fff"], ["#12c28a", "#08312a"], ["#ffb000", "#2a1c00"], ["#ff5a3c", "#fff"], ["#1d1b26", "#fff"]];

/* 分身：白い縁のステッカー。息を吸って、弾んで声を出す */
const Sticker = ({ f, x, y, h, speak = 0, inhale = 0, blow = 0, hop = 0, src = "char.png" }) => {
  const sx = 1 + speak * .1 - inhale * .1 + blow * .24, sy = 1 - speak * .09 + inhale * .14 - blow * .2 + Math.sin(f / 26) * .012;
  const edge = "#fff";
  return <Img src={staticFile(src)} style={{ position: "absolute", left: x, top: y - hop, height: h, transform: `translate(-50%,-100%) scale(${sx},${sy})`, transformOrigin: "50% 100%", imageRendering: "pixelated", filter: `drop-shadow(5px 0 0 ${edge}) drop-shadow(-5px 0 0 ${edge}) drop-shadow(0 5px 0 ${edge}) drop-shadow(0 -5px 0 ${edge}) drop-shadow(0 16px 26px rgba(90,20,0,.25))` }} />;
};

/* 冒頭：分身が声を出す→言葉→固まる→箱に入る→飛ぶ */
const BEATS = [30, 60, 90, 105, 135], WORDS = [["作文の書き出し、", 880, 200], ["声に出して", 760, 340], ["読ませてみたら", 1180, 340], ["みんな", 900, 480], ["書けました！", 1240, 480]];
const SENT = "作文の書き出し、声に出して読ませてみたら、みんな書けました！";
const OP = { gather: 170, into: 212, hit: 240, out: 450, shoot: 480, gone: 520 }, MOUTH = { x: 380, y: 480 }, LUMP = { x: 900, y: 360 }, BOX = { x: 660, y: 620, w: 900, h: 300 };
const Opening = ({ f, fps }) => {
  const speak = BEATS.reduce((v, at) => v + (f >= at && f < at + 18 ? Math.sin((f - at) / 18 * Math.PI) : 0), 0);
  const C = { x: BOX.x + BOX.w / 2, y: BOX.y + BOX.h / 2 };
  const b = bouncy(f, OP.gather + 10, fps, { damping: 8, stiffness: 170 }), into = lerp(f, OP.into, OP.hit, 0, 1, t => t * t), pull = lerp(f, OP.out, OP.shoot, 0, 1, smooth), fly = lerp(f, OP.shoot, OP.gone, 0, 1, t => t * t);
  const appear = bouncy(f, 150, fps, { damping: 14, stiffness: 140 }), hit = bouncy(f, OP.hit, fps, { damping: 7, stiffness: 320, mass: .6 }), filled = f >= OP.hit && f < OP.out + 8;
  return <>
    <Sticker f={f} x={300} y={960} h={560} speak={speak} blow={f >= OP.shoot ? Math.max(0, 1 - (f - OP.shoot) / 26) : 0} />
    <div style={{ position: "absolute", left: BOX.x, top: BOX.y, width: BOX.w, height: BOX.h, background: "#fff", borderRadius: 40, padding: 40, boxSizing: "border-box", transform: `translateY(${(1 - appear) * 700 + lerp(f, OP.shoot + 4, OP.shoot + 30, 0, 800, smooth)}px) scale(${f >= OP.hit ? 1 + (1 - hit) * .04 : 1})`, boxShadow: "0 26px 70px rgba(90,20,0,.22)", fontFamily: GOTHIC, color: "#1d1b26" }}>
      <div style={{ fontWeight: 700, fontSize: 28, opacity: .55, marginBottom: 12 }}>AI が、言葉にしました</div>
      <div style={{ fontWeight: 700, fontSize: 48, lineHeight: 1.4 }}>{filled ? SENT.slice(0, Math.floor(lerp(f, OP.hit, OP.hit + 14, 0, SENT.length))) : ""}</div>
    </div>
    {WORDS.map(([w, x, y], i) => { const g = lerp(f, OP.gather + i * 2, OP.gather + 26 + i * 2, 0, 1, t => t * t * t), o = lerp(f, BEATS[i], BEATS[i] + 22, 0, 1, t => 1 - (1 - t) ** 3), s = bouncy(f, BEATS[i], fps); if (f < BEATS[i] || g >= 1) return null; const px = MOUTH.x + (x - MOUTH.x) * o, py = MOUTH.y + (y - MOUTH.y) * o; return <Chip key={w} T={T} st={0} i={i} style={{ left: px + (LUMP.x - px) * g, top: py + (LUMP.y - py) * g, transform: `translate(-50%,-50%) scale(${s * (1 - g * .8)})` }}>{w}</Chip>; })}
    {f >= OP.gather + 10 && f < OP.hit && <Blob T={T} st={0} x={LUMP.x + (C.x - LUMP.x) * into} y={LUMP.y + (C.y - LUMP.y) * into - Math.sin(into * Math.PI) * 130} sx={b * (1 + into * .4)} sy={b * (1 - into * .2)} />}
    {f >= OP.out && f < OP.gone && <Blob T={T} st={0} x={C.x - pull * 40 + fly * 1200} y={C.y - fly * 340} sx={1 - pull * .18 + fly * 1.3} sy={1 + pull * .2 - fly * .75} />}
  </>;
};
const Title = ({ f, fps, line, top = 0 }) => { const s = bouncy(f, 6, fps, { damping: 9, stiffness: 180 }), u = bouncy(f, 40, fps, { damping: 14, stiffness: 150 }); return <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", color: "#fff", top }}><div style={{ fontFamily: GOTHIC, fontWeight: 900, fontSize: 230, letterSpacing: ".04em", lineHeight: 1.1, transform: `scale(${s})` }}>こえかた</div><div style={{ fontFamily: GOTHIC, fontWeight: 800, fontSize: line.length > 14 ? 54 : 84, marginTop: 30, opacity: Math.min(1, u * 1.3), transform: `translateY(${(1 - u) * 30}px)` }}>{line}</div></AbsoluteFill>; };

const K = 1.36, WINH = 930, VIS = WINH / K;
const offsetFor = y => Math.max(0, Math.min(860 - VIS, y - VIS / 2));
const Phone = ({ s, f, fps, keep }) => {
  const at = s.from, end = s.to, lf = f - at, e = keep ? 1 : bouncy(f, at, fps, { damping: 15, stiffness: 130 }), out = s.leave ? lerp(f, end - 12, end, 0, 1, smooth) : 0;
  let off = 0, media;
  if (s.take != null) {
    const tf = (s.take * FPS + lf) / 2, ks = TAKE.keys, i = ks.reduce((a, k, n) => (tf >= k.at ? n : a), 0), cur = ks[i], prev = ks[Math.max(0, i - 1)], m = lerp(tf, cur.at, cur.at + 24, 0, 1, smooth);
    const cy = b => b.box.y + b.box.h / 2; off = offsetFor(cy(prev) + (cy(cur) - cy(prev)) * m);
    media = <Sequence from={at} durationInFrames={end - at + 2} layout="none"><OffthreadVideo src={staticFile("app/take.mp4")} startFrom={Math.round(s.take * FPS)} muted style={{ position: "absolute", width: "100%", height: 860 * K, top: 0 }} /></Sequence>;
  } else { const r = REG[s.img]?.main; off = r ? offsetFor(r.y + r.h / 2) : 0; media = <Img src={staticFile(`app/${s.img}.png`)} style={{ position: "absolute", width: "100%", top: 0 }} />; }
  return <div style={{ position: "absolute", left: 1210, top: 60, width: 412 * K, height: WINH, borderRadius: 54, overflow: "hidden", background: "#fff", outline: "12px solid #1d1b26", transform: `translateY(${(1 - e) * 1100 - out * 1100}px) rotate(${(1 - e) * 4}deg)`, boxShadow: "0 34px 90px rgba(20,10,40,.28)" }}><div style={{ position: "absolute", inset: 0, transform: `translateY(${-off * K}px)`, opacity: keep ? lerp(lf, 0, 10, .25, 1, smooth) : 1 }}>{media}</div></div>;
};
const Desk = ({ s, f, fps }) => { const e = bouncy(f, s.from, fps, { damping: 15, stiffness: 130 }), r = REG[s.desk]?.main ?? { x: 200, y: 0, h: 500 }, scale = 1.25; return <div style={{ position: "absolute", left: 800, top: 240, width: 1060, height: 560, overflow: "hidden", borderRadius: 34, background: "#fff", transform: `translateX(${(1 - e) * 1200}px)`, boxShadow: "0 34px 90px rgba(10,30,70,.25)" }}><Img src={staticFile(`app/${s.desk}.png`)} style={{ position: "absolute", width: 1280 * scale, left: -r.x * scale + 30, top: -(r.y * scale) + 70 }} /></div>; };
const wrap = t => { if (t.length <= 9 || t.includes("\n")) return t; const i = t.search(/[、。](?=.)/); return i > 0 ? t.slice(0, i + 1) + "\n" + t.slice(i + 1) : t; };
const Head = ({ s, f, fps, color, wide }) => { const e = bouncy(f, s.from + 2, fps, { damping: 13, stiffness: 170 }), big = wrap(s.head), n = Math.max(...big.split("\n").map(l => l.length)), size = Math.min(120, Math.floor((s.desk ? 680 : wide ? 1700 : 1040) / n)); return <div style={{ position: "absolute", left: 100, top: s.desk ? 340 : 340, color, fontFamily: GOTHIC, opacity: Math.min(1, e * 1.4), transform: `translateY(${(1 - e) * 40}px)` }}><div style={{ fontWeight: 900, fontSize: size, lineHeight: 1.18, letterSpacing: "-.02em", whiteSpace: "pre-line" }}>{big}</div>{s.sub && <div style={{ fontWeight: 700, fontSize: 46, marginTop: 24 }}>{s.sub}</div>}</div>; };

const MADE = [["作る", "Claude Code：設計の聞き取り、実装とテスト、夜の作業"], ["動かす", "Claude API：聞き返す、言葉にする、知恵を探す"], ["任せる", "Managed Agents：夕方のまとめ"]];
const Making = ({ f, fps, at }) => { const l = f - at; return <>
  <div style={{ position: "absolute", left: 110, top: 300, width: 830, fontFamily: '"Menlo","Hiragino Sans",monospace', fontSize: 30, lineHeight: 1.75, color: "#c9c5d4" }}>{R.recent.slice(0, 5).map((c, i) => <div key={i} style={{ opacity: lerp(l, 20 + i * 14, 34 + i * 14, 0, 1), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c}</div>)}<div style={{ marginTop: 28, color: "#fff", fontFamily: GOTHIC, fontWeight: 800, fontSize: 48, opacity: lerp(l, 120, 140, 0, 1) }}>コミット {R.commits}　テスト {R.tests}</div></div>
  {MADE.map(([h, t], i) => { const e = bouncy(l, 240 + i * 120, fps); return <div key={h} style={{ position: "absolute", left: 1010, top: 300 + i * 210, width: 800, color: "#fff", fontFamily: GOTHIC, transform: `scale(${e})`, transformOrigin: "left center" }}><div style={{ fontWeight: 900, fontSize: 64, color: "#ffd24a" }}>{h}</div><div style={{ fontWeight: 600, fontSize: 38, lineHeight: 1.4 }}>{t}</div></div>; })}
</>; };

const Big = ({ f, at, end, big, small, color, fps, left = 100, top = 70, size = 124 }) => { if (f < at || f >= end) return null; const e = bouncy(f, at + 2, fps, { damping: 13, stiffness: 170 }); return <div style={{ position: "absolute", left, top, color, fontFamily: GOTHIC, opacity: Math.min(1, e * 1.4), transform: `translateY(${(1 - e) * 40}px)` }}><div style={{ fontWeight: 900, fontSize: size, lineHeight: 1.15, letterSpacing: "-.025em" }}>{big}</div>{small && <div style={{ fontWeight: 700, fontSize: 46, marginTop: 10 }}>{small}</div>}</div>; };
const BAR = TL.barSec * FPS;
const SCENES = TL.scenes.filter(s => !s.wait).map(s => ({ ...s, from: s.bar * BAR, to: (s.bar + s.bars) * BAR }));
export const FULL_FRAMES = TL.bars * BAR;
const ORDER = ["話す", "つながる", "たまる", "増える", "広がる"];
const STAGE_OF = { 冒頭: 0, 話す: 0, つながる: 1, たまる: 2, 増える: 3, もしも: 3, 広がる: 4, Claude: 6, 締め: 5 };
const STAGES = []; SCENES.forEach(s => { const n = STAGE_OF[s.stage]; if (!STAGES.length || STAGES[STAGES.length - 1].n !== n) STAGES.push({ at: s.from, n, c: COLORS[n] }); });
const SPANS = ORDER.map(n => { const l = SCENES.filter(s => s.stage === n || (n === "増える" && s.stage === "もしも")); return [l[0].from, l[l.length - 1].to]; });
const Backgrounds = ({ f }) => <>
  <AbsoluteFill style={{ background: STAGES[0].c[0] }} />
  {STAGES.slice(1).map(s => { const r = lerp(f, s.at - 14, s.at + 8, 0, 2300, smooth), b = lerp(f, s.at - 20, s.at + 4, 0, 2300, smooth); return b > 0 ? <AbsoluteFill key={s.at}><AbsoluteFill style={{ background: "#fff3c4", clipPath: `circle(${b}px at 960px 540px)` }} />{r > 0 && <AbsoluteFill style={{ background: s.c[0], clipPath: `circle(${r}px at 960px 540px)` }} />}</AbsoluteFill> : null; })}
</>;
const Progress = ({ f, color }) => { if (f < SPANS[0][0] || f >= SPANS[4][1]) return null; return <div style={{ position: "absolute", left: 100, width: 1040, bottom: 40, display: "flex", gap: 14, fontFamily: GOTHIC, fontWeight: 800, fontSize: 26, color }}>{SPANS.map(([a, b], i) => <div key={i} style={{ flex: `${b - a} 0 0`, minWidth: 90, whiteSpace: "nowrap", opacity: f >= a ? 1 : .45 }}><div style={{ height: 8, borderRadius: 9, background: `${color}44`, overflow: "hidden", marginBottom: 8 }}><div style={{ height: "100%", width: `${lerp(f, a, b, 0, 100)}%`, background: color }} /></div>{ORDER[i]}</div>)}</div>; };

export const Full = ({ voice = false }) => {
  const f = useCurrentFrame(), { fps } = useVideoConfig();
  const cur = SCENES.find(s => f >= s.from && f < s.to) ?? SCENES[SCENES.length - 1], stage = STAGES.reduce((a, s) => (f >= s.at ? s : a), STAGES[0]), ink = stage.c[1];
  const screen = cur.take != null || cur.img || cur.desk;
  const next = SCENES[SCENES.indexOf(cur) + 1], prevScene = SCENES[SCENES.indexOf(cur) - 1];
  const crossStart = SCENES.find(s => s.engine === "cross0")?.from ?? 0, c1 = SCENES.find(s => s.engine === "cross1")?.from ?? 0;
  const crossF = f < c1 ? lerp(f, crossStart, c1, 904, 935) : lerp(f, c1, c1 + 300, 936, 1040);
  const openAt = SCENES.find(s => s.engine === "open")?.from ?? 0, growAt = SCENES.find(s => s.engine === "grow")?.from ?? 0, madeAt = SCENES.find(s => s.engine === "made")?.from ?? 0, endAt = SCENES.find(s => s.engine === "end")?.from ?? 0, titleAt = SCENES.find(s => s.engine === "title")?.from ?? 0;
  return <AbsoluteFill style={{ overflow: "hidden" }}>
    <Backgrounds f={f} />
    {cur.engine === "fact" && <Head s={cur} f={f} fps={fps} color={ink} wide />}
    {cur.engine === "open" && <Opening f={f - openAt} fps={fps} />}
    {cur.engine === "open" && <Big f={f} at={cur.from} end={cur.to} big={cur.head} small={cur.sub} color="#fff" fps={fps} size={92} top={36} left={70} />}
    {cur.engine === "title" && <Title f={f - titleAt} fps={fps} line={cur.sub} />}
    {screen && (cur.desk ? <Desk s={cur} f={f} fps={fps} /> : <Phone s={{ ...cur, leave: !next || next.stage !== cur.stage }} f={f} fps={fps} keep={!!prevScene && prevScene.stage === cur.stage && (prevScene.take != null || prevScene.img)} />)}
    {screen && <Head s={cur} f={f} fps={fps} color={ink} />}
    {cur.engine === "grow" && <Grow f={f - growAt + 722} T={T} fps={fps} />}
    {cur.engine === "grow" && <Big f={f} at={cur.from} end={cur.to} big={cur.head} small={cur.sub} color={ink} fps={fps} />}
    {cur.engine === "text" && <Head s={cur} f={f} fps={fps} color={ink} wide />}
    {cur.engine?.startsWith("cross") && <Cross f={crossF} T={T} fps={fps} />}
    {cur.engine?.startsWith("cross") && <Big f={f} at={cur.from} end={cur.to} big={cur.head} small={cur.sub} color={ink} fps={fps} size={100} />}
    {cur.engine === "made" && <><Big f={f} at={cur.from} end={cur.to} big={cur.head} color="#fff" fps={fps} size={84} /><Making f={f} fps={fps} at={madeAt} /></>}
    {cur.engine === "end" && <Sticker f={f} x={1560} y={1010} h={380} blow={f - endAt < 60 ? 1 - (f - endAt) / 60 : 0} hop={Math.max(0, Math.sin((f - endAt) / 20)) * 40} />}
    {cur.engine === "end" && <Title f={f - endAt} fps={fps} line={cur.head} />}
    <Progress f={f} color={ink} />
    {screen && <div style={{ position: "absolute", left: 100, bottom: 104, fontFamily: GOTHIC, fontSize: 21, color: ink, opacity: .8 }}>開発中の実画面・架空の学校のダミー</div>}
    <Audio src={staticFile("full-music.wav")} />
    <Audio src={staticFile("full-sfx.wav")} />
  </AbsoluteFill>;
};
