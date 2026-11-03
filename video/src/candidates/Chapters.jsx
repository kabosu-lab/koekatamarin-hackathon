/* 章立ての版：題名と課題のカードのあと、番号付きの章で実画面を見せ、動詞でまとめる。生成画像の飾りを使わない */
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from "remotion";
import { NoRail, SCENES, Scene } from "./Story";
import S from "./story.json";
import { GOTHIC, MINCHO, NAMES, Quiet, inOut, lerp, smooth } from "./shared";

const INK = "#26231f", PAPER = "#f2efe9", SUB = "#6f655a", ACC = "#9c3412";

const Label = ({ children, f, at = 4 }) => <div style={{ fontFamily: GOTHIC, fontWeight: 500, fontSize: 28, letterSpacing: ".12em", color: ACC, opacity: lerp(f, at, at + 14, 0, 1) }}>{children}</div>;
const Rule = ({ f, at }) => <div style={{ width: lerp(f, at, at + 24, 0, 120, smooth), height: 3, background: ACC, margin: "34px 0" }} />;

const TitleCard = ({ f, name }) => (
  <AbsoluteFill style={{ background: PAPER, justifyContent: "center", paddingLeft: 170, opacity: inOut(f, 0, 180, 12) }}>
    <Label f={f}>デモ・高校の校内チャット × 声 × Claude</Label>
    <div style={{ fontFamily: MINCHO, fontWeight: 400, fontSize: 150, letterSpacing: ".12em", color: INK, marginTop: 26, lineHeight: 1.2 }}><Quiet text={NAMES[name]} f={f} at={8} stagger={3} blur={0} /></div>
    <Rule f={f} at={22} />
    <div style={{ fontFamily: GOTHIC, fontWeight: 300, fontSize: 50, color: INK, opacity: lerp(f, 30, 46, 0, 1) }}>話すだけで、校内のチャットに言葉を届ける窓口。</div>
  </AbsoluteFill>
);

const WHO = [["先生", "忙しく、一人で対応することが多い"], ["頼られる数人", "質問が集まる"], ["生徒", "連絡ばかりのチャットには、書きにくい"]];
const ProblemCard = ({ f }) => (
  <AbsoluteFill style={{ background: PAPER, justifyContent: "center", paddingLeft: 170, paddingRight: 170, opacity: inOut(f, 0, 270, 12) }}>
    <Label f={f}>課題</Label>
    <div style={{ fontFamily: GOTHIC, fontWeight: 400, fontSize: 70, color: INK, marginTop: 24 }}><Quiet text="困ったときに聞ける相手が、数人しかいない。" f={f} at={8} stagger={.8} blur={0} /></div>
    <Rule f={f} at={30} />
    {WHO.map(([who, what], i) => (
      <div key={who} style={{ display: "flex", fontFamily: GOTHIC, fontSize: 44, lineHeight: 1.85, opacity: lerp(f, 44 + i * 18, 60 + i * 18, 0, 1) }}>
        <div style={{ width: 340, fontWeight: 500, color: INK }}>{who}</div><div style={{ fontWeight: 300, color: INK }}>{what}</div>
      </div>
    ))}
    <div style={{ fontFamily: GOTHIC, fontWeight: 300, fontSize: 44, color: SUB, marginTop: 34, opacity: lerp(f, 130, 150, 0, 1) }}>AI に聞けば答えは出る。人に頼る機会は、さらに減る。</div>
  </AbsoluteFill>
);

/* 章：始まりのコマ、終わりのコマ、見出し。見出しは動詞で */
const CHAPTERS = [
  [720, 1170, "話しかける"], [1170, 1620, "言葉にして、見え方を確かめる"], [1620, 2190, "本人が送り、同僚に届く"],
  [2190, 2550, "強い言葉に気づく"], [2550, 2880, "人につなぐ"], [2880, 3240, "命や安全に関わるときは、相談室へ"],
  [3240, 3690, "朝、受け取って返す"], [3690, 4080, "ありがとうを届ける"], [4080, 4260, "一緒に勉強する"], [4260, 4410, "夕方、届ける項目を選ぶ"],
];
const Heading = ({ f }) => <>{CHAPTERS.map(([from, to, title], i) => f >= from && f < to && (
  <div key={from} style={{ position: "absolute", left: 64, top: 30, display: "flex", alignItems: "baseline", gap: 22, fontFamily: GOTHIC, opacity: inOut(f, from, to, 10) }}>
    <span style={{ fontWeight: 600, fontSize: 36, color: ACC, fontVariantNumeric: "tabular-nums" }}>{String(i + 1).padStart(2, "0")}</span>
    <span style={{ fontWeight: 500, fontSize: 40, color: INK }}>{title}</span>
  </div>
))}</>;

const VERBS = ["話す", "確かめる", "本人が送る", "受け取って返す"];
const EndCard = ({ f, name }) => (
  <AbsoluteFill style={{ background: PAPER, justifyContent: "center", paddingLeft: 170 }}>
    <div style={{ fontFamily: MINCHO, fontWeight: 400, fontSize: 130, letterSpacing: ".12em", color: INK, lineHeight: 1.2 }}>{NAMES[name]}</div>
    <Rule f={f} at={12} />
    <div style={{ display: "flex", gap: 64, fontFamily: GOTHIC, fontWeight: 500, fontSize: 46, color: ACC }}>
      {VERBS.map((v, i) => <span key={v} style={{ opacity: lerp(f, 24 + i * 22, 42 + i * 22, 0, 1) }}>{v}</span>)}
    </div>
    <div style={{ fontFamily: MINCHO, fontWeight: 300, fontSize: 56, letterSpacing: ".14em", color: INK, marginTop: 56, opacity: lerp(f, 150, 180, 0, 1) }}>一人で抱えない。</div>
    <AbsoluteFill style={{ background: "#000", opacity: lerp(f, 396, 420, 0, 1) }} />
  </AbsoluteFill>
);

export const Chapters = ({ name = "hira" }) => {
  const f = useCurrentFrame();
  return (
    <NoRail.Provider value={true}>
      <AbsoluteFill style={{ background: PAPER }}>
        {SCENES.slice(0, -1).map(([at, dur, C]) => <Sequence key={at} from={at} durationInFrames={dur + 8} layout="none"><Scene C={C} name={name} /></Sequence>)}
        <Sequence durationInFrames={186} layout="none"><TitleCard f={f} name={name} /></Sequence>
        <Sequence from={180} durationInFrames={276} layout="none"><ProblemCard f={f - 180} /></Sequence>
        <Heading f={f} />
        <Sequence from={4860} layout="none"><EndCard f={f - 4860} name={name} /></Sequence>
        <Sequence durationInFrames={450} layout="none"><Audio src={staticFile("music-a.wav")} volume={.7} /></Sequence>
        <Audio src={staticFile("music-full.wav")} />
        {S.voice.map(v => <Sequence key={v.id} from={v.at} layout="none"><Audio src={staticFile(`${v.id}.wav`)} volume={1.1} /></Sequence>)}
      </AbsoluteFill>
    </NoRail.Provider>
  );
};
