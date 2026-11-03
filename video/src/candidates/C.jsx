/* C 手紙：先生の声に沿って手紙の文字が書かれ、別の人の字で返事が届く */
import { AbsoluteFill, Audio, Img, Sequence, staticFile, useCurrentFrame } from "remotion";
import L from "./lines.json";
import { LetterPaper } from "./scenes";
import { Grain, MINCHO, NAMES, Quiet, Vignette, inOut, lerp, smooth } from "./shared";

/* 便箋の罫に合わせる（紙を 1.5 倍に写すので、列の幅は約 122px） */
const PAPER = 1.5, CELL = 81.1 * PAPER, SUMI = "#2b2520", BLUE = "#1f3f6e";
const colX = c => 1920 - 165 - c * CELL;

/* 上から下へ、墨がにじむように1文字ずつ現れる */
const Char = ({ c, f, at, pace }) => {
  const p = lerp(f, at, at + Math.max(pace, 4) + 2, 0, 1);
  return <span style={{ display: "inline-block", width: 88, height: 72, textAlign: "center", clipPath: `inset(0 0 ${(1 - p) * 100}% 0)`, opacity: p > 0 ? .55 + .45 * p : 0 }}>{c}</span>;
};
const Column = ({ line, f, dim }) => (
  <div style={{ position: "absolute", left: colX(line.col) - 44, top: 78, width: 88, fontFamily: MINCHO, fontWeight: 300, fontSize: line.col === 0 ? 58 : 66, lineHeight: "88px", color: line.reply ? BLUE : SUMI, opacity: dim, writingMode: "vertical-rl", whiteSpace: "nowrap" }}>
    {line.text.split("").map((c, i) => <Char key={i} c={c} f={f} at={line.at + i * line.pace} pace={line.pace} />)}
  </div>
);
const Vertical = ({ children, style }) => <div style={{ position: "absolute", writingMode: "vertical-rl", fontFamily: MINCHO, whiteSpace: "nowrap", ...style }}>{children}</div>;

export const CandidateC = ({ name = "hira", art = "codex" }) => {
  const f = useCurrentFrame();
  const cam = lerp(f, 0, 450, 1.0, 1.035), dim = lerp(f, 366, 396, 1, .34, smooth);
  return (
    <AbsoluteFill style={{ background: "#e9e1d2" }}>
      <AbsoluteFill style={{ transform: `scale(${cam})`, transformOrigin: "62% 50%", opacity: lerp(f, 0, 12, 0, 1) }}>
        {art === "code" ? <LetterPaper cell={CELL} right={colX(0)} /> : <Img src={staticFile("letter-paper.png")} style={{ position: "absolute", width: 1672 * 1.148 * PAPER, height: 941 * 1.148 * PAPER, left: 1920 - 1672 * 1.148 * PAPER + 40, top: -120, maxWidth: "none" }} />}
        {L.c.map(line => <Column key={line.col} line={line} f={f} dim={line.reply ? lerp(f, 366, 396, 1, .8, smooth) : dim} />)}
        <Vertical style={{ left: colX(7) - 24, top: 640, fontSize: 38, color: BLUE, letterSpacing: ".08em", opacity: lerp(f, 340, 356, 0, 1) * lerp(f, 366, 396, 1, .7, smooth), fontWeight: 300 }}>同じ学年の先生より</Vertical>
      </AbsoluteFill>

      {/* 誰の手紙か */}
      <Vertical style={{ left: 120, top: 90, fontSize: 40, letterSpacing: ".14em", fontWeight: 300, color: "#6f6455", opacity: inOut(f, 10, 222, 14) }}><Quiet text="ある高校の先生の手紙" f={f} at={10} rise={0} blur={2} /></Vertical>
      <Vertical style={{ left: 330, top: 110, fontSize: 52, letterSpacing: ".08em", fontWeight: 300, color: SUMI, opacity: inOut(f, 228, 366, 12) }}><Quiet text="声が、言葉になって、人へ届く。" f={f} at={228} stagger={2} rise={0} blur={3} /></Vertical>

      <Vertical style={{ left: 300, top: 120, fontSize: 158, letterSpacing: ".1em", fontWeight: 300, color: SUMI, lineHeight: 1, opacity: lerp(f, 378, 408, 0, 1, smooth) }}>{NAMES[name]}</Vertical>
      <Vertical style={{ left: 160, top: 130, fontSize: 54, letterSpacing: ".18em", fontWeight: 300, color: "#4a4238", lineHeight: 1, opacity: lerp(f, 392, 418, 0, 1, smooth) }}>一人で抱えない。</Vertical>

      <Vignette strength={.16} />
      <Grain f={f} opacity={.07} />
      <Audio src={staticFile("music-c.wav")} />
      {L.voice.map(v => <Sequence key={v.id} from={v.at} layout="none"><Audio src={staticFile(`${v.id}.wav`)} volume={.95} /></Sequence>)}
    </AbsoluteFill>
  );
};
