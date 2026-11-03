import { AbsoluteFill, interpolate, random } from "remotion";

export const GOTHIC = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", sans-serif';
export const MINCHO = '"Hiragino Mincho ProN", "YuMincho", serif';
const clampOpt = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };
export const smooth = x => x * x * (3 - 2 * x);
export const easeOut = x => 1 - Math.pow(1 - x, 3);
export const lerp = (f, a, b, x, y, ease) => interpolate(f, [a, b], [x, y], { ...clampOpt, easing: ease });
/* 入って、しばらくいて、出る */
export const inOut = (f, a, b, fade = 12) => Math.min(lerp(f, a, a + fade, 0, 1, smooth), lerp(f, b - fade, b, 1, 0, smooth));

/* 跳ねさせず、1文字ずつ静かに現れる文字 */
export const Quiet = ({ text, f, at = 0, stagger = 1.6, rise = 10, blur = 6 }) => (
  <>
    {text.split("").map((c, i) => {
      const p = lerp(f, at + i * stagger, at + i * stagger + 16, 0, 1, smooth);
      return <span key={i} style={{ display: "inline-block", whiteSpace: "pre", opacity: p, transform: `translateY(${(1 - p) * rise}px)`, filter: blur ? `blur(${(1 - p) * blur}px)` : undefined }}>{c}</span>;
    })}
  </>
);

/* フィルムの粒子 */
export const Grain = ({ f, opacity = .1 }) => (
  <AbsoluteFill style={{ opacity, mixBlendMode: "overlay", pointerEvents: "none" }}>
    <svg width="1920" height="1080"><filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed={Math.floor(f / 2) % 12} /><feColorMatrix type="saturate" values="0" /></filter><rect width="1920" height="1080" filter="url(#grain)" /></svg>
  </AbsoluteFill>
);

/* 周辺を落とす */
export const Vignette = ({ strength = .5 }) => <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 50%, transparent 45%, rgba(0,0,0,${strength}) 100%)`, pointerEvents: "none" }} />;

/* 空気の中の細かいちり */
export const Dust = ({ f, n = 30, seed = "d", color = "255,235,205", box = [0, 0, 1920, 1080] }) => (
  <AbsoluteFill style={{ pointerEvents: "none" }}>
    {Array.from({ length: n }).map((_, i) => {
      const x = box[0] + random(`${seed}x${i}`) * box[2], y = box[1] + random(`${seed}y${i}`) * box[3], s = 1.5 + random(`${seed}s${i}`) * 2.5;
      const ph = random(`${seed}p${i}`) * 6.28;
      return <div key={i} style={{ position: "absolute", left: x + Math.sin(f / 70 + ph) * 26, top: y - f * .1 + Math.cos(f / 50 + ph) * 12, width: s, height: s, borderRadius: "50%", background: `rgba(${color},${.14 + .24 * (.5 + .5 * Math.sin(f / 30 + ph))})` }} />;
    })}
  </AbsoluteFill>
);

export const NAMES = { hira: "こえかた", kata: "コエカタ" };
