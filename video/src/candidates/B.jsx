/* B 実画面が主役：アプリの本当の画面を大きく映し、操作に合わせて言葉を添える */
import { AbsoluteFill, Audio, Img, staticFile, useCurrentFrame } from "remotion";
import REG from "./regions.json";
import { GOTHIC, NAMES, Quiet, easeOut, inOut, lerp, smooth } from "./shared";

const INK = "#26231f", BG = "#f2efe9", SUB = "#85796c";
const Say = ({ f, at, end, text, top, size = 62 }) => (
  <div style={{ position: "absolute", left: 150, top, fontFamily: GOTHIC, fontWeight: 300, fontSize: size, lineHeight: 1.5, letterSpacing: ".03em", color: INK, opacity: inOut(f, at, end, 10), whiteSpace: "nowrap" }}><Quiet text={text} f={f} at={at} stagger={1} blur={0} /></div>
);

/* スマホの状態：コマごとに本物の画面を切り替える */
const PHONE = [[0, "phone-1-idle"], [112, "phone-2-listening"], [128, "phone-3-heard-1"], [136, "phone-3-heard-2"], [144, "phone-3-heard-3"], [152, "phone-3-heard-4"], [160, "phone-3-heard-5"], [184, "phone-4-replied"], [204, "phone-5-draft"], [226, "phone-8-sent"]];
/* タップの位置は、撮ったときの画面の位置から求める */
const at = (img, key, fx = .5) => { const r = REG[img]?.[key] ?? { x: 0, y: 0, w: 412, h: 860 }; return [(r.x + r.w * fx) / 412, (r.y + r.h / 2) / 860]; };
const TAPS = [[106, ...at("phone-1-idle", "main", .25)], [178, ...at("phone-1-idle", "main")], [199, ...at("phone-4-replied", "send")], [221, ...at("phone-7-before-send", "send")]];
const Phone = ({ f }) => {
  const enter = easeOut(lerp(f, 84, 112, 0, 1)), W = 470, H = W * 860 / 412;
  const cur = PHONE.filter(([a]) => f >= a).pop()[1];
  return (
    <div style={{ position: "absolute", left: 1150, top: (1080 - H) / 2 + (1 - enter) * 60, width: W + 24, height: H + 24, opacity: enter, background: "#17140f", borderRadius: 62, padding: 12, boxShadow: "0 40px 90px rgba(60,40,20,.26)" }}>
      <div style={{ position: "relative", width: W, height: H, borderRadius: 50, overflow: "hidden", background: "#fff" }}>
        <Img src={staticFile(`app/${cur}.png`)} style={{ width: W, height: H, display: "block" }} />
        {TAPS.map(([t, x, y]) => {
          const p = lerp(f, t, t + 14, 0, 1);
          return p > 0 && p < 1 ? <div key={t} style={{ position: "absolute", left: x * W - 34, top: y * H - 34, width: 68, height: 68, borderRadius: "50%", background: "rgba(40,30,20,.3)", opacity: 1 - p, transform: `scale(${.6 + p * .8})` }} /> : null;
        })}
      </div>
    </div>
  );
};

/* 校内チャネル：投稿と返信の実画面へ寄る */
const Desk = ({ f }) => {
  const enter = lerp(f, 236, 258, 0, 1, smooth), W = 1400, H = W * 800 / 1280;
  const zoom = lerp(f, 250, 372, 1.0, 1.25, smooth), reply = lerp(f, 306, 318, 0, 1, smooth);
  return (
    <div style={{ position: "absolute", left: 420, top: (1080 - H) / 2, width: W, height: H, opacity: enter, borderRadius: 18, overflow: "hidden", boxShadow: "0 40px 90px rgba(60,40,20,.24)", background: "#fff" }}>
      <div style={{ width: W, height: H, transform: `scale(${zoom})`, transformOrigin: "87.5% 100%" }}>
        <Img src={staticFile("app/teams-1-posted.png")} style={{ position: "absolute", width: W, height: H }} />
        <Img src={staticFile("app/teams-2-replied.png")} style={{ position: "absolute", width: W, height: H, opacity: reply }} />
      </div>
    </div>
  );
};

export const CandidateB = ({ name = "kata" }) => {
  const f = useCurrentFrame();
  const phoneOut = lerp(f, 232, 250, 1, 0, smooth), deskOut = lerp(f, 366, 384, 1, 0, smooth);
  return (
    <AbsoluteFill style={{ background: BG }}>
      <Say f={f} at={6} end={82} text="高校の先生は、AI には話せても、" top={420} size={74} />
      <Say f={f} at={30} end={82} text="同僚には、話せない。" top={540} size={74} />

      {f > 80 && <div style={{ opacity: phoneOut }}><Phone f={f} /></div>}
      <Say f={f} at={98} end={176} text="ボタンを押して、話すだけ。" top={470} />
      <Say f={f} at={186} end={214} text="話したことが、下書きになる。" top={470} />
      <Say f={f} at={214} end={240} text="送るのは、本人。" top={470} />

      {f > 232 && <div style={{ opacity: deskOut }}><Desk f={f} /></div>}
      <div style={{ position: "absolute", left: 92, top: 480, width: 310, fontFamily: GOTHIC, fontWeight: 300, fontSize: 46, lineHeight: 1.55, color: INK, opacity: inOut(f, 244, 372, 10) }}>
        言葉が、<br />同僚に届く。<br /><span style={{ opacity: lerp(f, 306, 320, 0, 1) }}>返事が来る。</span>
      </div>

      <div style={{ position: "absolute", left: 150, bottom: 56, fontFamily: GOTHIC, fontSize: 24, color: SUB, opacity: inOut(f, 92, 372, 10) }}>開発中の実画面・架空の学校のダミー</div>

      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: lerp(f, 384, 408, 0, 1, smooth) }}>
        <div style={{ fontFamily: GOTHIC, fontWeight: 500, fontSize: 132, letterSpacing: ".12em", color: INK }}>{NAMES[name]}</div>
        <div style={{ fontFamily: GOTHIC, fontWeight: 300, fontSize: 46, letterSpacing: ".14em", color: "#5c5347", marginTop: 24 }}>一人で抱えない。</div>
      </AbsoluteFill>
      <Audio src={staticFile("music-b.wav")} />
    </AbsoluteFill>
  );
};
