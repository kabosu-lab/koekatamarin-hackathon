/* D 今の15秒を整える：床の文字、言葉の壁、拍の流れは残し、色を抑え、跳ねとドット絵をやめる */
import { AbsoluteFill, Audio, Img, Sequence, random, staticFile, useCurrentFrame } from "remotion";
import T from "../timing.json";
import { SakuraDusk } from "./scenes";
import { GOTHIC, Grain, MINCHO, NAMES, Quiet, Vignette, easeOut, lerp, smooth } from "./shared";

const NAVY = "#0f1422", PAPER = "#ecebe6", SAKURA = "#e7b9c4";
const Space = ({ children, p = 1400, style }) => <AbsoluteFill style={{ perspective: p, overflow: "hidden", ...style }}>{children}</AbsoluteFill>;
const World = ({ children, transform }) => <AbsoluteFill style={{ transformStyle: "preserve-3d", transform }}>{children}</AbsoluteFill>;

/* 人は絵にせず、灯りで見せる。届くと灯りがともる */
const Light = ({ x, y, s = 1, light = 0 }) => (
  <div style={{ position: "absolute", left: x, top: y, width: 300 * s, height: 300 * s }}>
    <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: `radial-gradient(circle, rgba(246,214,190,${.85 * light}) 0%, rgba(240,180,170,${.32 * light}) 32%, rgba(240,180,170,0) 70%)` }} />
    <div style={{ position: "absolute", left: "50%", top: "50%", width: 26 * s, height: 26 * s, marginLeft: -13 * s, marginTop: -13 * s, borderRadius: "50%", background: `rgb(${70 + light * 180},${78 + light * 158},${100 + light * 120})` }} />
  </div>
);

const Floor = ({ f }) => {
  const tilt = lerp(f, 44, 66, 56, 0, smooth), dolly = lerp(f, 0, 44, 260, 50, easeOut), z = lerp(f, 44, 66, 40, -260, smooth);
  return (
    <AbsoluteFill style={{ background: NAVY, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, display: "flex", alignItems: "center", justifyContent: "center", transformOrigin: "960px 540px", transform: `perspective(1100px) translateY(${60 * (tilt / 56)}px) rotateX(${tilt}deg) translateY(${dolly}px) translateZ(${z}px)` }}>
        <div style={{ position: "absolute", left: -1400, top: -1400, width: 4720, height: 3880, backgroundImage: "linear-gradient(rgba(210,220,240,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(210,220,240,.07) 1px, transparent 1px)", backgroundSize: "150px 150px" }} />
        <div style={{ position: "relative", fontFamily: GOTHIC, fontWeight: 300, fontSize: 210, letterSpacing: ".06em", color: PAPER, whiteSpace: "nowrap" }}><Quiet text="高校の先生は" f={f} at={2} stagger={4} rise={30} blur={0} /></div>
      </div>
    </AbsoluteFill>
  );
};

const BUSY = "提出物 会議 部活 面談 成績 保護者 行事 校務 進路 清掃 出張 報告書 授業準備 課題 生徒指導 校外学習 採点 時間割 委員会 掲示物".split(" ");
const Wall = ({ f }) => (
  <Space p={1000} style={{ background: NAVY }}>
    <World transform={`translateZ(${lerp(f, 0, 72, -100, 40)}px) rotateY(${lerp(f, 0, 72, -3, 3)}deg)`}>
      {Array.from({ length: 11 }).map((_, r) => (
        <div key={r} style={{ position: "absolute", top: -60 + r * 118, left: -700, whiteSpace: "nowrap", fontFamily: GOTHIC, fontWeight: 300, fontSize: 88, color: `rgba(190,200,225,${lerp(f, 10, 30, .34, .12) * (r % 3 === 1 ? 1.4 : .8)})`, transform: `translateX(${(r % 2 ? -1 : 1) * (f * (1.3 + r * .12)) - 300 * (r % 2)}px)` }}>
          {Array.from({ length: 30 }).map((_, i) => BUSY[(i * 3 + r * 7) % BUSY.length]).join("　")}
        </div>
      ))}
    </World>
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: lerp(f, 18, 38, 0, 1, smooth), transform: `scale(${lerp(f, 18, 72, .97, 1.03)})` }}>
      <div style={{ fontFamily: MINCHO, fontWeight: 300, fontSize: 420, letterSpacing: ".06em", lineHeight: 1, color: PAPER }}>孤独</div>
    </AbsoluteFill>
  </Space>
);

const Solved = ({ f }) => (
  <Space style={{ background: PAPER }}>
    <World transform={`rotateY(${lerp(f, 0, 66, -5, 4)}deg)`}>
      <div style={{ position: "absolute", inset: -240, fontFamily: GOTHIC, fontWeight: 300, fontSize: 56, lineHeight: 1.5, color: "rgba(30,50,70,.07)", wordBreak: "break-all", transform: `translateY(${-f * 1.6}px)` }}>{"完了 解決 検索 要約 下書き 翻訳 集計 ".repeat(90)}</div>
      <div style={{ position: "absolute", left: -200, right: -200, top: 420, textAlign: "center", fontFamily: GOTHIC, fontWeight: 300, fontSize: 170, letterSpacing: ".05em", color: "#1d2a3a", whiteSpace: "nowrap" }}><Quiet text="AI で、解けた。" f={f} at={2} stagger={3} rise={16} blur={0} /></div>
    </World>
  </Space>
);

const Unreached = ({ f }) => {
  const reach = easeOut(lerp(f, 10, 44, 0, 1)), fade = lerp(f, 36, 62, 1, .25, smooth);
  return (
    <Space style={{ background: NAVY }}>
      <World transform={`translateZ(${lerp(f, 0, 70, 0, 50)}px)`}>
        <Light x={1400} y={300} s={.9} /><Light x={1560} y={560} s={.8} />
        <div style={{ position: "absolute", left: 130, top: 170, fontFamily: MINCHO, fontWeight: 300, fontSize: 130, letterSpacing: ".06em", color: "#b9c1d6" }}><Quiet text="人には、" f={f} at={6} stagger={3} rise={8} /></div>
        <div style={{ position: "absolute", left: 130, top: 400, display: "flex", alignItems: "flex-end", fontFamily: MINCHO, fontWeight: 300, color: PAPER }}>
          <div style={{ fontSize: 340, lineHeight: 1, transform: `translateX(${reach * 300}px)` }}>届</div>
          <div style={{ fontSize: 130, marginLeft: 330, opacity: lerp(f, 18, 30, 0, 1) * fade, transform: `translateY(${lerp(f, 36, 66, 0, 34, smooth)}px)`, whiteSpace: "nowrap", letterSpacing: ".04em" }}>かない</div>
        </div>
      </World>
    </Space>
  );
};

const WORDS = [["悩み", 1040, 280], ["頑張り", 1400, 340], ["困った", 980, 500], ["できた", 1370, 560], ["助けて", 1000, 730], ["ありがとう", 1320, 780]];
const Voice = ({ f }) => {
  const launch = lerp(f, T.swoosh - 240, T.swoosh - 240 + 20, 0, 1, x => x * x);
  return (
    <Space p={1100} style={{ background: "#171c2d" }}>
      <World transform={`rotateY(${lerp(f, 0, 78, 3, -2)}deg) scale(${lerp(f, 0, 78, 1, 1.03)})`}>
        <div style={{ position: "absolute", left: 140, top: 430, fontFamily: MINCHO, fontWeight: 300, fontSize: 112, letterSpacing: ".08em", color: PAPER, opacity: 1 - launch * .8, whiteSpace: "nowrap" }}><Quiet text="声を、言葉に。" f={f} at={2} stagger={3} rise={10} /></div>
        {WORDS.map(([w, x, y], i) => {
          const at = T.pops[i] - 240, p = lerp(f, at, at + 14, 0, 1, smooth);
          return <div key={w} style={{ position: "absolute", left: x, top: y, padding: "12px 34px", fontFamily: GOTHIC, fontWeight: 300, fontSize: 56, letterSpacing: ".04em", color: i % 2 ? SAKURA : PAPER, border: `1px solid ${i % 2 ? "rgba(231,185,196,.6)" : "rgba(236,235,230,.45)"}`, borderRadius: 999, whiteSpace: "nowrap", opacity: p * (1 - launch), transform: `translateY(${(1 - p) * 16}px) translateZ(${launch * 700}px)` }}>{w}</div>;
        })}
      </World>
    </Space>
  );
};

const Reach = ({ f }) => {
  const light = i => lerp(f, 8 + i * 8, 30 + i * 8, 0, 1, smooth);
  return (
    <Space style={{ background: `rgb(${23 + lerp(f, 0, 60, 0, 40)},${28 + lerp(f, 0, 60, 0, 30)},${45 + lerp(f, 0, 60, 0, 22)})` }}>
      <Light x={250} y={500} s={1.3} light={light(0)} /><Light x={760} y={450} s={1.4} light={light(1)} /><Light x={1290} y={500} s={1.3} light={light(2)} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 150, textAlign: "center", fontFamily: MINCHO, fontWeight: 300, fontSize: 140, letterSpacing: ".1em", color: PAPER, whiteSpace: "nowrap" }}><Quiet text="人へ、届ける。" f={f} at={2} stagger={4} rise={10} /></div>
    </Space>
  );
};

const Title = ({ f, name, art }) => (
  <Space style={{ background: NAVY }}>
    <AbsoluteFill style={{ transform: `scale(${lerp(f, 0, 78, 1.02, 1.08, smooth)})`, filter: art === "code" ? undefined : "saturate(.55) brightness(.62) contrast(.96)" }}>
      {art === "code" ? <SakuraDusk /> : <Img src={staticFile("school.jpg")} style={{ width: 1920, height: 1080, objectFit: "cover" }} />}
    </AbsoluteFill>
    <AbsoluteFill style={{ background: "linear-gradient(rgba(12,14,26,.25), rgba(12,14,26,.62))" }} />
    <AbsoluteFill style={{ background: "radial-gradient(ellipse 760px 330px at 50% 50%, rgba(12,14,26,.78), rgba(12,14,26,0))" }} />
    {Array.from({ length: 16 }).map((_, i) => {
      const x = random(`dx${i}`) * 1920, p = (f + random(`dd${i}`) * 90) / 150, s = 10 + random(`ds${i}`) * 10;
      return <div key={i} style={{ position: "absolute", left: x + Math.sin(p * 5 + i) * 50, top: p * 1200 - 80, width: s, height: s * .76, background: SAKURA, opacity: .55, borderRadius: "70% 10% 70% 10%", transform: `rotate(${p * 240 + i * 37}deg)` }} />;
    })}
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontFamily: GOTHIC, fontWeight: 300, fontSize: 176, letterSpacing: ".16em", color: "#fff", lineHeight: 1.1, opacity: lerp(f, 8, 30, 0, 1, smooth) }}>{NAMES[name]}</div>
      <div style={{ marginTop: 26, fontFamily: GOTHIC, fontWeight: 300, fontSize: 54, letterSpacing: ".18em", color: "#f1ecec", opacity: lerp(f, 24, 44, 0, 1, smooth) }}>一人で抱えない。</div>
    </AbsoluteFill>
  </Space>
);

const CUTS = { floor: Floor, wall: Wall, solved: Solved, unreached: Unreached, voice: Voice, reach: Reach, title: Title };
const Cut = ({ cut, name, art }) => {
  const f = useCurrentFrame(), C = CUTS[cut];
  return <AbsoluteFill style={{ opacity: lerp(f, 0, 10, 0, 1, smooth) }}><C f={f} name={name} art={art} /></AbsoluteFill>;
};

export const CandidateD = ({ name = "kata", art = "codex" }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: NAVY }}>
      {Object.entries(T.cuts).map(([cut, [a, b]]) => <Sequence key={cut} from={a} durationInFrames={b - a} layout="none"><Cut cut={cut} name={name} art={art} /></Sequence>)}
      <Vignette strength={.3} />
      <Grain f={f} opacity={.09} />
      <Audio src={staticFile("music-d.wav")} />
      {T.voice.map(v => <Sequence key={v.id} from={v.at} layout="none"><Audio src={staticFile(`${v.id}.wav`)} volume={1.05} /></Sequence>)}
    </AbsoluteFill>
  );
};
