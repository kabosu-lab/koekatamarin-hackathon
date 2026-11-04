/* ミニキャラが息を吸って、声のかたまりを出し、枠の外へ届ける試作（7秒・60コマ）。絵はコードで描く */
import { AbsoluteFill, Audio, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { GOTHIC, lerp, smooth } from "./shared";

export const VOICE_CHAR_FRAMES = 420;
const BEATS = [40, 70, 100, 115, 145], WORDS = ["作文の", "書き出し、", "声に出したら", "みんな", "書けた！"];
const SHOOT = 262, CX = 520, CY = 650;
const boing = (f, at, fps, k = {}) => (f < at ? 0 : spring({ frame: f - at, fps, config: { damping: 9, stiffness: 240, mass: .6, ...k } }));

const Char = ({ f, fps }) => {
  const speak = BEATS.reduce((v, at) => v + (f >= at && f < at + 18 ? Math.sin((f - at) / 18 * Math.PI) : 0), 0);
  const inhale = lerp(f, 210, 256, 0, 1, smooth) * (f < SHOOT ? 1 : 0), blow = f >= SHOOT ? Math.max(0, 1 - (f - SHOOT) / 26) : 0, after = f >= SHOOT + 26 ? boing(f, SHOOT + 26, fps, { damping: 7 }) : 0;
  const sx = 1 + speak * .12 - inhale * .12 + blow * .28, sy = 1 - speak * .1 + inhale * .16 - blow * .22 + Math.sin(f / 26) * .012;
  const mouth = Math.max(speak, blow * 1.4), hop = f >= SHOOT + 26 ? Math.sin(Math.min(1, (f - SHOOT - 26) / 40) * Math.PI) * 60 : 0;
  return <div style={{ position: "absolute", left: CX - 170, top: CY - 170 - hop, width: 340, height: 340, transform: `scale(${sx},${sy})`, transformOrigin: "50% 100%" }}>
    <div style={{ position: "absolute", inset: 0, borderRadius: "50% 50% 46% 46%", background: "radial-gradient(circle at 36% 26%, #fff 0%, #fff6d8 55%, #ffd76a 100%)", boxShadow: "0 24px 50px rgba(120,30,10,.28)" }} />
    <div style={{ position: "absolute", left: 96, top: 120, width: 30, height: 40 - inhale * 8, borderRadius: "50%", background: "#26202f" }} />
    <div style={{ position: "absolute", left: 208, top: 120, width: 30, height: 40 - inhale * 8, borderRadius: "50%", background: "#26202f" }} />
    {mouth > .12
      ? <div style={{ position: "absolute", left: 170 - (34 + mouth * 34), top: 200 - mouth * 6, width: (34 + mouth * 34) * 2, height: 12 + mouth * 74, borderRadius: "50%", background: "#7a2230" }} />
      : <div style={{ position: "absolute", left: 136, top: 180, width: 68, height: 34, borderBottom: "10px solid #7a2230", borderRadius: "0 0 60px 60px", boxSizing: "border-box" }} />}
    {after > 0 && <div style={{ position: "absolute", left: 84, top: 186, width: 44, height: 22, borderRadius: "50%", background: "#ff9d8a", opacity: .7 }} />}
    {after > 0 && <div style={{ position: "absolute", left: 212, top: 186, width: 44, height: 22, borderRadius: "50%", background: "#ff9d8a", opacity: .7 }} />}
  </div>;
};

const POS = [[830, 250], [1200, 330], [900, 440], [1290, 520], [980, 630]];
const Words = ({ f, fps }) => <>{WORDS.map((w, i) => {
  const at = BEATS[i], out = lerp(f, at, at + 24, 0, 1, t => 1 - (1 - t) ** 3), s = boing(f, at, fps), g = lerp(f, 178 + i * 3, 214 + i * 3, 0, 1, t => t * t * t);
  if (f < at || g >= 1) return null;
  const sx = CX + 130, sy = CY - 90, x = sx + (POS[i][0] - sx) * out, y = sy + (POS[i][1] - sy) * out, tx = x + (1000 - x) * g, ty = y + (440 - y) * g;
  return <div key={w} style={{ position: "absolute", left: tx, top: ty, transform: `translate(-50%,-50%) scale(${s * (1 - g * .7)})`, background: "#fff", color: "#1d1b26", fontFamily: GOTHIC, fontWeight: 800, fontSize: 58, lineHeight: 1, padding: "26px 36px", borderRadius: 999, whiteSpace: "nowrap", boxShadow: "0 14px 36px rgba(120,30,10,.22)" }}>{w}</div>;
})}</>;

const lumpAt = f => { const k = lerp(f, SHOOT, SHOOT + 28, 0, 1, t => t * t), back = lerp(f, 222, SHOOT, 0, 1, smooth); return { x: 1000 - back * 130 + k * 1120, y: 440 + back * 20 - k * 90 - Math.sin(k * Math.PI) * 120 }; };
const Blob = ({ x, y, sx, sy, o = 1 }) => <div style={{ position: "absolute", left: x - 110, top: y - 110, width: 220, height: 220, borderRadius: "50%", opacity: o, transform: `scale(${sx},${sy})`, background: "radial-gradient(circle at 34% 28%, #fff 0%, #fff3c4 45%, #ffd24a 100%)", boxShadow: "0 18px 50px rgba(120,30,10,.24)" }} />;
const Lump = ({ f, fps }) => { if (f < 200 || f >= SHOOT + 28) return null; const b = boing(f, 200, fps, { damping: 8, stiffness: 170 }), k = lerp(f, SHOOT, SHOOT + 28, 0, 1, t => t * t), p = lumpAt(f); return <>{k > 0 && [10, 8, 6, 4, 2].map(d => { const t = lumpAt(f - d); return <Blob key={d} x={t.x} y={t.y} sx={b * (1 + k)} sy={b * (1 - k * .6)} o={.14 * (11 - d) / 6} />; })}<Blob x={p.x} y={p.y} sx={b * (1 + k * 1.2)} sy={b * (1 - k * .7)} /></>; };

const Frame = ({ f, fps }) => { const hit = f >= SHOOT + 16 ? boing(f, SHOOT + 16, fps, { damping: 6, stiffness: 320 }) : 1, bump = f >= SHOOT + 16 ? 1 + (1 - hit) * .03 : 1; return <div style={{ position: "absolute", left: 90, top: 110, width: 1500, height: 860, border: "10px solid #fff", borderRadius: 48, boxSizing: "border-box", transform: `scale(${bump})` }}><div style={{ position: "absolute", left: 40, top: 28, fontFamily: GOTHIC, fontWeight: 900, fontSize: 52, color: "#fff" }}>学校</div></div>; };
const Sparks = ({ f }) => { if (f < SHOOT + 20) return null; const k = lerp(f, SHOOT + 20, SHOOT + 90, 0, 1, t => 1 - (1 - t) ** 2), cs = ["#fff", "#ffe08a", "#1f9dff", "#12c28a", "#7a5cff"]; return <>{Array.from({ length: 26 }).map((_, i) => { const a = i / 26 * 6.283; return <div key={i} style={{ position: "absolute", left: 1700 + Math.cos(a) * (40 + k * (120 + (i % 4) * 70)), top: 300 + Math.sin(a) * (40 + k * (120 + (i % 3) * 90)), width: 30, height: 30, borderRadius: "50%", background: cs[i % 5], transform: `scale(${1 - k * .4})` }} />; })}</>; };

export const VoiceChar = () => { const f = useCurrentFrame(), { fps } = useVideoConfig(); return <AbsoluteFill style={{ background: "#ff5a3c", overflow: "hidden" }}><Frame f={f} fps={fps} /><Char f={f} fps={fps} /><Words f={f} fps={fps} /><Lump f={f} fps={fps} /><Sparks f={f} /><Audio src={staticFile("voice-char.wav")} /></AbsoluteFill>; };
