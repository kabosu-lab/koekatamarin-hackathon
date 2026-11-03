/* A 静かな記録：夜の職員室から朝の廊下へ。声も太鼓もなく、ピアノと先生の言葉だけ */
import { AbsoluteFill, Audio, Img, staticFile, useCurrentFrame } from "remotion";
import { MorningCorridor, NightRoom } from "./scenes";
import { Dust, Grain, MINCHO, NAMES, Quiet, Vignette, inOut, lerp, smooth } from "./shared";

const Line = ({ f, at, end, children, size = 68, top, left = 140, color = "#f2ebdd" }) => (
  <div style={{ position: "absolute", left, top, fontFamily: MINCHO, fontWeight: 300, fontSize: size, lineHeight: 1.7, letterSpacing: ".06em", color, opacity: inOut(f, at, end, 14), whiteSpace: "nowrap", textShadow: "0 2px 24px rgba(0,0,0,.65)" }}>{children}</div>
);

export const CandidateA = ({ name = "hira", art = "codex" }) => {
  const f = useCurrentFrame();
  const night = lerp(f, 0, 260, 1, 1.09);
  const lamp = .94 + Math.sin(f / 37) * .025 + Math.sin(f / 11) * .012;
  const toDay = lerp(f, 222, 276, 0, 1, smooth);
  const day = lerp(f, 222, 450, 1.08, 1.0);
  const toTitle = lerp(f, 366, 396, 0, 1, smooth);
  return (
    <AbsoluteFill style={{ background: "#05070c" }}>
      <AbsoluteFill style={{ opacity: lerp(f, 0, 26, 0, 1), transform: `scale(${night})`, transformOrigin: "86% 42%", filter: `brightness(${lamp * 1.12})` }}>
        {art === "code" ? <NightRoom lamp={lamp} /> : <Img src={staticFile("night-staffroom.png")} style={{ width: 1920, height: 1080, objectFit: "cover" }} />}
      </AbsoluteFill>
      <Dust f={f} n={22} box={[1200, 240, 660, 480]} />

      {/* ランプの光が広がって朝になる */}
      <AbsoluteFill style={{ background: "radial-gradient(circle at 86% 42%, rgba(255,226,180,1), rgba(255,226,180,.55) 40%, rgba(255,226,180,0) 72%)", opacity: lerp(f, 206, 244, 0, 1, smooth) * lerp(f, 244, 280, 1, 0, smooth) }} />
      <AbsoluteFill style={{ opacity: toDay, transform: `scale(${day})`, transformOrigin: "30% 40%" }}>
        {art === "code" ? <MorningCorridor /> : <Img src={staticFile("morning-corridor.png")} style={{ width: 1920, height: 1080, objectFit: "cover" }} />}
      </AbsoluteFill>
      {f > 222 && <div style={{ opacity: toDay }}><Dust f={f} n={40} seed="m" box={[800, 300, 1100, 700]} /></div>}
      <AbsoluteFill style={{ background: "linear-gradient(90deg, rgba(20,16,20,.62), rgba(20,16,20,.18) 62%, rgba(20,16,20,0))", opacity: toDay }} />
      <AbsoluteFill style={{ background: "rgba(16,12,16,.34)", opacity: toTitle }} />

      <Line f={f} at={16} end={108} top={420} size={46}><span style={{ color: "#b9ae9c" }}><Quiet text="高校の先生の、午後九時。" f={f} at={16} /></span></Line>
      <Line f={f} at={44} end={118} top={510}><Quiet text="今日のこと、誰にも話さなかった。" f={f} at={44} /></Line>
      <Line f={f} at={124} end={214} top={420}><Quiet text="AI には、聞けた。" f={f} at={124} /></Line>
      <Line f={f} at={150} end={214} top={540}><Quiet text="同僚には、聞けなかった。" f={f} at={150} /></Line>

      <Line f={f} at={268} end={368} top={640} color="#fffaf0"><Quiet text="声を、言葉にして。" f={f} at={268} /></Line>
      <Line f={f} at={298} end={368} top={756} color="#fffaf0"><Quiet text="隣の先生へ、生徒へ、届ける。" f={f} at={298} /></Line>

      <AbsoluteFill style={{ justifyContent: "flex-end", paddingLeft: 140, paddingBottom: 130, opacity: lerp(f, 376, 404, 0, 1, smooth) }}>
        <div style={{ fontFamily: MINCHO, fontWeight: 300, fontSize: 150, letterSpacing: ".14em", color: "#fffaf0", lineHeight: 1.25, textShadow: "0 2px 40px rgba(0,0,0,.5)" }}>{NAMES[name]}</div>
        <div style={{ fontFamily: MINCHO, fontWeight: 300, fontSize: 52, letterSpacing: ".16em", color: "#f2e8da", marginTop: 26, textShadow: "0 2px 24px rgba(0,0,0,.6)" }}>一人で抱えない。</div>
      </AbsoluteFill>

      <Vignette strength={.42} />
      <Grain f={f} opacity={.16} />
      <AbsoluteFill style={{ background: "#000", opacity: lerp(f, 436, 450, 0, .85) }} />
      <Audio src={staticFile("music-a.wav")} />
    </AbsoluteFill>
  );
};
