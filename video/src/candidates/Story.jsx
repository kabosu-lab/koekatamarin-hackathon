/* 通し版：一件の話を追う。カメラは実画面の操作している部分に寄る */
import { createContext, useContext } from "react";
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from "remotion";
import R from "./repo-facts.json";
import REG from "./regions.json";
import S from "./story.json";
import TAKE from "./take.json";
import { Grain, GOTHIC, MINCHO, NAMES, Quiet, Vignette, inOut, lerp, smooth } from "./shared";

const INK = "#26231f", CREAM = "#fff8f3", PAPER = "#f2efe9", SUB = "#85796c", ACC = "#9c3412";
const SIZE = { phone: [412, 860], teams: [1280, 800] };
const sizeOf = n => n.startsWith("teams") ? SIZE.teams : SIZE.phone;

function view(key) {
  const [iw, ih] = sizeOf(key.img), full = REG[key.img]?.[key.region ?? "main"] ?? { x: 0, y: 0, w: iw, h: ih };
  /* 横に長い投稿は、本文のある左側だけに寄る */
  const r = { ...full, w: full.w * (key.crop ?? 1) };
  const scale = Math.min(key.max ?? 3.4, 1640 / r.w, 620 / r.h);
  return { scale, cx: r.x + r.w / 2, cy: r.y + r.h / 2 };
}

/* 実画面を映すカメラ：keys は { at, img, region }。切り替えで寄る場所へ滑らかに動く */
export const Cam = ({ f, keys, taps = [], bg = CREAM, cy = 450 }) => {
  const idx = keys.reduce((a, k, i) => (f >= k.at ? i : a), 0), cur = keys[idx], prev = keys[Math.max(0, idx - 1)];
  const k = lerp(f, cur.at, cur.at + 20, 0, 1, smooth), a = view(prev), b = view(cur);
  const scale = (a.scale + (b.scale - a.scale) * k) * lerp(f, cur.at, cur.at + 220, 1, 1.025);
  const px = a.cx + (b.cx - a.cx) * k, py = a.cy + (b.cy - a.cy) * k;
  const [iw, ih] = sizeOf(cur.img), fade = lerp(f, cur.at, cur.at + 7, 0, 1);
  return (
    <AbsoluteFill style={{ background: bg, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 960 - px * scale, top: cy - py * scale, width: iw * scale, height: ih * scale }}>
        <Img src={staticFile(`app/${prev.img}.png`)} style={{ position: "absolute", width: "100%", height: "100%" }} />
        <Img src={staticFile(`app/${cur.img}.png`)} style={{ position: "absolute", width: "100%", height: "100%", opacity: fade }} />
        {taps.map(([t, img, region]) => {
          const p = lerp(f, t, t + 16, 0, 1), r = REG[img]?.[region];
          if (!r || p <= 0 || p >= 1) return null;
          const d = 22 + p * 26;
          return <div key={t} style={{ position: "absolute", left: (r.x + r.w / 2 - d / 2) * scale, top: (r.y + r.h / 2 - d / 2) * scale, width: d * scale, height: d * scale, borderRadius: "50%", background: "rgba(40,30,20,.34)", opacity: 1 - p }} />;
        })}
      </div>
      <AbsoluteFill style={{ background: `linear-gradient(${bg}00 72%, ${bg}f5 80%, ${bg} 100%)` }} />
      <AbsoluteFill style={{ background: `linear-gradient(${bg} 0%, ${bg} 9%, ${bg}00 15%)` }} />
    </AbsoluteFill>
  );
};

/* 字幕は下に大きく1行 */
const Caption = ({ f, lines }) => <>{lines.map(([at, end, t]) => <div key={at} style={{ position: "absolute", left: 0, right: 0, bottom: 62, textAlign: "center", fontFamily: GOTHIC, fontWeight: 400, fontSize: 54, letterSpacing: ".02em", color: INK, opacity: inOut(f, at, end, 10), whiteSpace: "nowrap" }}>{t}</div>)}</>;

/* 今どの段階かを、上に小さく示す */
/* 章立ての版では、上の段階表示の代わりに章の見出しを出す */
export const NoRail = createContext(false);
const STEPS = ["話す", "言葉にする", "確かめる", "本人が送る", "届く"];
const Rail = ({ now }) => useContext(NoRail) ? null : (
  <div style={{ position: "absolute", left: 0, right: 0, top: 44, display: "flex", justifyContent: "center", gap: 46, fontFamily: GOTHIC, fontSize: 30 }}>
    {STEPS.map((s, i) => <span key={s} style={{ color: i === now ? ACC : "#bdb3a6", fontWeight: i === now ? 600 : 300 }}>{s}</span>)}
  </div>
);
const Tag = ({ text = "開発中の実画面・架空の学校のダミー・台本モード" }) => <div style={{ position: "absolute", right: 46, bottom: 24, fontFamily: GOTHIC, fontSize: 21, color: SUB }}>{text}</div>;

const Problem = ({ f }) => <>
  <Cam f={f} bg="#f1f0f7" keys={[{ at: 0, img: "teams-notices", max: 2.2, crop: .72 }]} cy={430} />
  <Caption f={f} lines={[[6, 120, "校内チャットは、連絡ばかり。"], [124, 270, "何を書けばいいかも、分からない。"]]} />
  <Tag />
</>;

/* 話す→相棒が返す→下書き→確かめる→本人が送る を、切らずに撮った映像で見せる。カメラだけが動く */
const boxView = b => { const scale = Math.min(3.4, 1640 / b.w, 620 / b.h); return { scale, cx: b.x + b.w / 2, cy: b.y + b.h / 2 }; };
const LiveCam = ({ f }) => {
  const idx = TAKE.keys.reduce((a, k, i) => (f >= k.at ? i : a), 0), cur = TAKE.keys[idx], prev = TAKE.keys[Math.max(0, idx - 1)];
  const k = lerp(f, cur.at, cur.at + 24, 0, 1, smooth), a = boxView(prev.box), b = boxView(cur.box);
  const scale = a.scale + (b.scale - a.scale) * k, px = a.cx + (b.cx - a.cx) * k, py = a.cy + (b.cy - a.cy) * k;
  const [iw, ih] = TAKE.size;
  return (
    <AbsoluteFill style={{ background: CREAM, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 960 - px * scale, top: 450 - py * scale, width: iw * scale, height: ih * scale }}>
        <OffthreadVideo src={staticFile("app/take.mp4")} muted style={{ position: "absolute", width: "100%", height: "100%" }} />
        {TAKE.taps.map(t => {
          const p = lerp(f, t.at, t.at + 16, 0, 1), d = 22 + p * 26;
          return p > 0 && p < 1 ? <div key={t.at} style={{ position: "absolute", left: (t.x - d / 2) * scale, top: (t.y - d / 2) * scale, width: d * scale, height: d * scale, borderRadius: "50%", background: "rgba(40,30,20,.34)", opacity: 1 - p }} /> : null;
        })}
      </div>
      <AbsoluteFill style={{ background: `linear-gradient(${CREAM}00 72%, ${CREAM}f5 80%, ${CREAM} 100%)` }} />
      <AbsoluteFill style={{ background: `linear-gradient(${CREAM} 0%, ${CREAM} 9%, ${CREAM}00 15%)` }} />
    </AbsoluteFill>
  );
};
const PhoneStory = ({ f }) => (
  <>
    <LiveCam f={f} />
    <Rail now={TAKE.keys.filter(k => f >= k.at).pop()?.step ?? 0} />
    <Caption f={f} lines={[[10, 290, "話すだけ。"], [304, 445, "相棒が聞いて、返す。"], [456, 685, "話したことが、そのまま下書きになる。"], [696, 895, "校内チャットにどう見えるかを、先に確かめる。"], [906, 1075, "AI は投稿しない。送るのは、本人。"]]} />
    <Tag />
  </>
);
const Delivered = ({ f }) => <>
  <Cam f={f} bg="#f1f0f7" keys={[{ at: 0, img: "teams-1-posted", max: 2.5, crop: .72 }, { at: 150, img: "teams-2-replied", max: 2.5, crop: .72 }]} cy={450} />
  <Rail now={4} />
  <Caption f={f} lines={[[6, 146, "本人の名前で、同僚に届く。"], [160, 382, "返事が、来る。"]]} />
  <Tag />
</>;
const Harsh = ({ f }) => <>
  <Cam f={f} keys={[{ at: 0, img: "phone-9-caution" }, { at: 210, img: "phone-10-rephrased" }]} />
  <Caption f={f} lines={[[8, 205, "強く聞こえる言葉は、そう知らせて、別の言い方を提案する。"], [218, 352, "選ぶのは、本人。"]]} />
  <Tag />
</>;
const Connect = ({ f }) => <>
  <Cam f={f} keys={[{ at: 0, img: "phone-12-connect" }]} />
  <Caption f={f} lines={[[8, 322, "煮詰まったときだけ、相談できそうな人を紹介する。"]]} />
  <Tag />
</>;
const Safety = ({ f }) => <>
  <Cam f={f} keys={[{ at: 0, img: "phone-11-safety", max: 2.6 }, { at: 190, img: "phone-11-safety", region: "lines", max: 2.6 }]} />
  <Caption f={f} lines={[[8, 186, "命や安全に関わる話だけ、要点を相談室へ。話した言葉は渡さない。"], [194, 352, "本人にもその場で知らせ、今すぐ話せる窓口を見せる。"]]} />
  <Tag />
</>;

/* 一日の機能：朝から夕方まで、実画面を短く */
const DAY = ["朝", "昼", "放課後", "夕方"];
const DayRail = ({ now }) => useContext(NoRail) ? null : (
  <div style={{ position: "absolute", left: 0, right: 0, top: 44, display: "flex", justifyContent: "center", gap: 46, fontFamily: GOTHIC, fontSize: 30 }}>
    {DAY.map((s, i) => <span key={s} style={{ color: i === now ? ACC : "#bdb3a6", fontWeight: i === now ? 600 : 300 }}>{s}</span>)}
  </div>
);
const DAY_KEYS = [
  { at: 0, img: "feature-today", s: 0, max: 2.2 }, { at: 150, img: "feature-inbox", s: 0, max: 2.4 }, { at: 270, img: "feature-inbox-reply", s: 0, max: 2 }, { at: 390, img: "feature-inbox-goal", s: 0 },
  { at: 450, img: "feature-thanks", s: 1 }, { at: 630, img: "feature-buddy", s: 1, max: 2.8 }, { at: 720, img: "feature-sakura", s: 1, max: 2.4 }, { at: 840, img: "feature-room", s: 2, max: 2.8 },
  { at: 1020, img: "feature-daily-checked", s: 3, max: 2.2 }, { at: 1100, img: "feature-daily-received", s: 3, max: 2 },
];
const FEATURE_FRAMES = 1170;
const Features = ({ f }) => <>
  <Cam f={f} keys={DAY_KEYS} />
  <DayRail now={DAY_KEYS.filter(k => f >= k.at).pop().s} />
  <Caption f={f} lines={[[6, 146, "朝は、誰かの頑張りを、3枚だけ。"], [154, 386, "相談には、話して返す。"], [394, 446, "返せたら、ゴール。"], [454, 626, "ありがとうは、相手に届く。"], [634, 716, "やり取りすると、相棒が育つ。"], [724, 836, "やり取りが葉になって、桜が咲いていく。"], [844, 1016, "話さなくても、誰かが勉強している気配が分かる。"], [1024, 1165, "チェックした項目だけが、管理職に届く。"]]} />
  <Tag />
</>;
const Making = ({ f }) => (
  <AbsoluteFill style={{ background: "#14161c" }}>
    <div style={{ position: "absolute", left: 110, top: 110, fontFamily: GOTHIC, fontWeight: 300, fontSize: 68, color: "#f2efe9" }}><Quiet text="現場の教員が、Claude と作った" f={f} at={6} stagger={1} blur={0} /></div>
    <div style={{ position: "absolute", left: 110, top: 280, width: 860, fontFamily: '"Menlo", "Hiragino Sans", monospace', fontSize: 32, lineHeight: 1.8, color: "#c7c3ba" }}>
      {R.recent.slice(0, 5).map((l, i) => <div key={i} style={{ opacity: lerp(f, 40 + i * 10, 54 + i * 10, 0, 1), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l}</div>)}
      <div style={{ marginTop: 26, color: "#a8a59d", fontSize: 30, opacity: lerp(f, 100, 120, 0, 1) }}>コミット {R.commits}・テスト {R.tests}・Codex の見直し {R.reviews}（補助）</div>
    </div>
    <div style={{ position: "absolute", left: 1040, top: 290, width: 780, fontFamily: GOTHIC, fontWeight: 300, fontSize: 40, lineHeight: 1.6, color: "#f2efe9" }}>
      {[["作る", "Claude Code：設計の聞き取り、実装とテスト、夜の作業"], ["動かす", "Claude API：相棒、下書き、言い方の確認"], ["これから", "Managed Agents：夕方の自動まとめ（開発中）"]].map(([h, t], i) => <div key={h} style={{ marginBottom: 40, opacity: lerp(f, 150 + i * 60, 172 + i * 60, 0, 1) }}><div style={{ color: "#e39a7b", fontWeight: 500 }}>{h}</div>{t}</div>)}
    </div>
  </AbsoluteFill>
);
/* 夜で始まり、朝で終わる */
const Ending = ({ f, name }) => (
  <AbsoluteFill style={{ background: "#000" }}>
    <AbsoluteFill style={{ transform: `scale(${lerp(f, 0, 420, 1.06, 1)})`, transformOrigin: "30% 40%" }}><Img src={staticFile("morning-corridor.png")} style={{ width: 1920, height: 1080, objectFit: "cover" }} /></AbsoluteFill>
    <AbsoluteFill style={{ background: "linear-gradient(90deg, rgba(20,16,20,.66), rgba(20,16,20,.18) 62%, rgba(20,16,20,0))" }} />
    <AbsoluteFill style={{ background: "rgba(16,12,16,.3)", opacity: lerp(f, 150, 190, 0, 1, smooth) }} />
    <div style={{ position: "absolute", left: 140, top: 660, fontFamily: MINCHO, fontWeight: 300, fontSize: 62, lineHeight: 1.7, letterSpacing: ".05em", color: "#fffaf0", opacity: inOut(f, 10, 170, 14), textShadow: "0 2px 24px rgba(0,0,0,.6)" }}>話したことを、届く言葉に。<br />送るのは、本人。</div>
    <AbsoluteFill style={{ justifyContent: "flex-end", paddingLeft: 140, paddingBottom: 130, opacity: lerp(f, 176, 206, 0, 1, smooth) }}>
      <div style={{ fontFamily: MINCHO, fontWeight: 300, fontSize: 150, letterSpacing: ".14em", color: "#fffaf0", lineHeight: 1.25, textShadow: "0 2px 40px rgba(0,0,0,.5)" }}>{NAMES[name]}</div>
      <div style={{ fontFamily: MINCHO, fontWeight: 300, fontSize: 52, letterSpacing: ".16em", color: "#f2e8da", marginTop: 26, textShadow: "0 2px 24px rgba(0,0,0,.6)" }}>一人で抱えない。</div>
    </AbsoluteFill>
    <Vignette strength={.38} /><Grain f={f} opacity={.14} />
    <AbsoluteFill style={{ background: "#000", opacity: lerp(f, 396, 420, 0, 1) }} />
  </AbsoluteFill>
);

export const SCENES = [[450, 270, Problem], [720, 1080, PhoneStory], [1800, 390, Delivered], [2190, 360, Harsh], [2550, 330, Connect], [2880, 360, Safety], [3240, FEATURE_FRAMES, Features], [4410, 450, Making], [4860, 420, Ending]];
export const CHAPTER_FRAMES = 5280;
/* 通し版は、冒頭の15秒に課題の画面まで入れたので、その分だけ後ろを前に詰める */
const SHIFT = 270;
export const STORY_FRAMES = CHAPTER_FRAMES - SHIFT;
export const Scene = ({ C, name }) => { const f = useCurrentFrame(); return <AbsoluteFill style={{ opacity: lerp(f, 0, 12, 0, 1, smooth) }}><C f={f} name={name} /></AbsoluteFill>; };

/* 冒頭15秒：誰の（夜の職員室）→どんな課題（連絡ばかりの実画面）→どう解決（話すだけで届ける） */
export const Opening = ({ name = "hira" }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "#05070c" }}>
      {f < 172 && <AbsoluteFill style={{ opacity: lerp(f, 0, 20, 0, 1), transform: `scale(${lerp(f, 0, 170, 1, 1.05)})`, transformOrigin: "86% 42%" }}><Img src={staticFile("night-staffroom.png")} style={{ width: 1920, height: 1080, objectFit: "cover" }} /></AbsoluteFill>}
      {f < 172 && <div style={{ position: "absolute", left: 140, top: 430, fontFamily: MINCHO, fontWeight: 300, color: "#f2ebdd", letterSpacing: ".06em", textShadow: "0 2px 24px rgba(0,0,0,.65)", opacity: inOut(f, 10, 158, 12) }}>
        <div style={{ fontSize: 46, color: "#cfc5b4" }}><Quiet text="高校の先生の、午後九時。" f={f} at={12} /></div>
        <div style={{ fontSize: 68, marginTop: 30 }}><Quiet text="今日のこと、誰にも話さなかった。" f={f} at={44} /></div>
      </div>}
      {f >= 150 && f < 330 && <AbsoluteFill style={{ opacity: lerp(f, 150, 166, 0, 1, smooth) }}>
        <Cam f={f - 150} bg="#f1f0f7" keys={[{ at: 0, img: "teams-notices", max: 2.2, crop: .72 }]} cy={430} />
        <Caption f={f - 150} lines={[[6, 172, "校内チャットは、連絡ばかり。"]]} />
        <Tag />
      </AbsoluteFill>}
      {f >= 316 && <AbsoluteFill style={{ background: PAPER, justifyContent: "center", paddingLeft: 170, opacity: lerp(f, 316, 330, 0, 1, smooth) }}>
        <div style={{ fontFamily: MINCHO, fontWeight: 400, fontSize: 130, letterSpacing: ".12em", color: INK, lineHeight: 1.2 }}>{NAMES[name]}</div>
        <div style={{ width: lerp(f, 326, 350, 0, 120, smooth), height: 3, background: ACC, margin: "32px 0" }} />
        <div style={{ fontFamily: GOTHIC, fontWeight: 300, fontSize: 52, color: INK, opacity: lerp(f, 336, 352, 0, 1) }}>話すだけで、校内のチャットに言葉を届ける。</div>
        <div style={{ fontFamily: GOTHIC, fontWeight: 300, fontSize: 52, color: INK, marginTop: 14, opacity: lerp(f, 360, 376, 0, 1) }}>送るのは、本人。</div>
      </AbsoluteFill>}
      <Sequence layout="none"><Audio src={staticFile("music-a.wav")} volume={.7} /></Sequence>
      <Sequence from={160} layout="none"><Audio src={staticFile("s1.wav")} volume={1.1} /></Sequence>
      <Sequence from={330} layout="none"><Audio src={staticFile("c1.wav")} volume={1.1} /></Sequence>
    </AbsoluteFill>
  );
};

const OPENED = new Set(["s1"]);
export const Story = ({ name = "hira" }) => (
  <AbsoluteFill style={{ background: PAPER }}>
    <Sequence durationInFrames={456}><Opening name={name} /></Sequence>
    {SCENES.slice(1).map(([at, dur, C]) => <Sequence key={at} from={at - SHIFT} durationInFrames={dur + 8} layout="none"><Scene C={C} name={name} /></Sequence>)}
    <Audio src={staticFile("music-full.wav")} />
    {S.voice.filter(v => !v.only && !OPENED.has(v.id)).map(v => <Sequence key={v.id} from={v.at - SHIFT} layout="none"><Audio src={staticFile(`${v.id}.wav`)} volume={1.1} /></Sequence>)}
  </AbsoluteFill>
);

/* E 静かな実演：飾らず、一件の話が15秒で届くまで */
const E_KEYS = [{ at: 84, img: "phone-2-listening", s: 0 }, { at: 100, img: "phone-3-heard-3", s: 0 }, { at: 130, img: "phone-3-heard-5", s: 0 }, { at: 172, img: "phone-5-draft", s: 1 }, { at: 240, img: "phone-7-before-send", s: 3 }, { at: 296, img: "phone-8-sent", s: 3 }];
export const CandidateE = ({ name = "kata" }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: PAPER }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 410, textAlign: "center", fontFamily: GOTHIC, fontWeight: 300, fontSize: 66, lineHeight: 1.65, color: INK, opacity: inOut(f, 4, 84, 10) }}>
        <div><Quiet text="高校の先生は、良かったことも、" f={f} at={4} stagger={.8} blur={0} /></div>
        <div><Quiet text="困ったことも、一人で抱えがち。" f={f} at={28} stagger={.8} blur={0} /></div>
      </div>
      {f >= 78 && f < 326 && <AbsoluteFill style={{ opacity: lerp(f, 78, 90, 0, 1, smooth) }}>
        <Cam f={f} keys={E_KEYS} taps={[[280, "phone-7-before-send", "send"]]} />
        <Rail now={E_KEYS.filter(k => f >= k.at).pop()?.s ?? 0} />
        <Caption f={f} lines={[[88, 168, "話すだけ。"], [176, 236, "話したことが、下書きになる。"], [244, 322, "AI は投稿しない。送るのは、本人。"]]} />
      </AbsoluteFill>}
      {f >= 318 && f < 396 && <AbsoluteFill style={{ opacity: lerp(f, 318, 330, 0, 1, smooth) }}>
        <Cam f={f} bg="#f1f0f7" keys={[{ at: 0, img: "teams-2-replied", max: 2.5, crop: .72 }]} cy={450} />
        <Rail now={4} />
        <Caption f={f} lines={[[326, 392, "同僚に届き、返事が来る。"]]} />
      </AbsoluteFill>}
      <AbsoluteFill style={{ background: PAPER, alignItems: "center", justifyContent: "center", opacity: lerp(f, 388, 408, 0, 1, smooth) }}>
        <div style={{ fontFamily: GOTHIC, fontWeight: 500, fontSize: 132, letterSpacing: ".12em", color: INK }}>{NAMES[name]}</div>
        <div style={{ fontFamily: GOTHIC, fontWeight: 300, fontSize: 46, letterSpacing: ".14em", color: "#5c5347", marginTop: 24 }}>一人で抱えない。</div>
      </AbsoluteFill>
      <Audio src={staticFile("music-b.wav")} />
    </AbsoluteFill>
  );
};
