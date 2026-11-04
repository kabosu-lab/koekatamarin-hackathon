import { AbsoluteFill, Audio, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, random } from "remotion";
import T from "./timing.json";

const GOTHIC = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", sans-serif';
const MINCHO = '"Hiragino Mincho ProN", "YuMincho", serif';
const MARU = '"Hiragino Maru Gothic ProN", sans-serif';
const MONO = '"Osaka-Mono", "Menlo", monospace';
const clampOpt = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };
const lerp = (f, a, b, x, y, ease) => interpolate(f, [a, b], [x, y], { ...clampOpt, easing: ease });
const inOut = x => x * x * (3 - 2 * x), inCube = x => x * x * x, outCube = x => 1 - Math.pow(1 - x, 3);
const useSpring = (f, cfg = { damping: 11, mass: .6, stiffness: 170 }) => { const { fps } = useVideoConfig(); return spring({ frame: f, fps, config: cfg }); };
/* 拍の頭で跳ねる量（0〜1） */
const beatPulse = f => Math.exp(-((f % T.beat)) / 4.5);
const Space = ({ children, p = 1500, style }) => <AbsoluteFill style={{ perspective: p, perspectiveOrigin: "50% 50%", overflow: "hidden", ...style }}>{children}</AbsoluteFill>;
const World = ({ children, transform }) => <AbsoluteFill style={{ transformStyle: "preserve-3d", transform }}>{children}</AbsoluteFill>;
const Pixel = ({ src, h, style }) => <Img src={staticFile(src)} style={{ height: h, width: h, objectFit: "contain", objectPosition: "50% 100%", position: "absolute", ...style }} />;
const Word = ({ c, f, delay = 0, style, drop = 90 }) => {
  const s = useSpring(f - delay);
  return <span style={{ display: "inline-block", transform: `translateY(${(1 - s) * drop}px) scale(${.5 + .5 * s}, ${1.25 - .25 * s})`, opacity: Math.min(1, s * 2), ...style }}>{c}</span>;
};
const Petals = ({ f, n = 40, seed = "p", from = 0, speed = 1, size = 24, spread = 1 }) => (
  <AbsoluteFill style={{ pointerEvents: "none" }}>
    {Array.from({ length: n }).map((_, i) => {
      const x0 = random(`${seed}x${i}`) * 2100 - 90, d = random(`${seed}d${i}`) * 50, p = (f - from - d) / (70 / speed);
      if (p < 0 || p > 1.2) return null;
      const y = p * 1250 * spread - 90, x = x0 + Math.sin(p * 7 + i) * 70, sc = .6 + random(`${seed}s${i}`) * 1.4;
      return <div key={i} style={{ position: "absolute", left: x, top: y, width: size * sc, height: size * .78 * sc, background: i % 3 ? "#ffb7cd" : "#ffd5e2", borderRadius: "70% 10% 70% 10%", transform: `rotate(${p * 500 + i * 37}deg)` }} />;
    })}
  </AbsoluteFill>
);

/* 1：文字を床に敷く。カメラが床を滑り、最後に壁へ起き上がる */
const Floor = ({ f }) => {
  const tilt = lerp(f, 44, 66, 54, 0, inOut), dolly = lerp(f, 0, 44, 330, 60, outCube), z = lerp(f, 44, 66, 40, -300, inOut);
  return (
    <Space p={1100} style={{ background: "linear-gradient(#0a1030, #1a2358 58%, #101638)" }}>
      <World transform={`translateY(${60 * (tilt / 54)}px) rotateX(${tilt}deg) translateY(${dolly}px) translateZ(${z}px)`}>
        <AbsoluteFill style={{ inset: -1400, backgroundImage: "linear-gradient(rgba(130,160,255,.2) 2px, transparent 2px), linear-gradient(90deg, rgba(130,160,255,.2) 2px, transparent 2px)", backgroundSize: "150px 150px" }} />
        <div style={{ position: "absolute", left: -400, right: -400, top: 330, textAlign: "center", fontFamily: GOTHIC, fontWeight: 900, fontSize: 262, letterSpacing: "-.01em", color: "#fff", whiteSpace: "nowrap", textShadow: "0 16px 0 #2b3a8f" }}>
          {"学校の先生は".split("").map((c, i) => <Word key={i} c={c} f={f} delay={2 + i * 5} drop={160} />)}
        </div>
        {[-980, -780, -580, -380, -180, 30, 720, 930, 1130].map((y, r) => <div key={r} style={{ position: "absolute", left: -900, right: -900, top: y, textAlign: "center", whiteSpace: "nowrap", fontFamily: GOTHIC, fontWeight: 800, fontSize: 118, color: `rgba(170,190,255,${.16 + (r % 3) * .09})` }}>{Array.from({ length: 12 }).map((_, i) => ["職員室", "教室", "放課後", "部活", "廊下", "進路室"][(i + r * 2) % 6]).join("　　")}</div>)}
      </World>
    </Space>
  );
};

/* 2：予定の壁に囲まれ、中央に「孤独」。最後は文字の白の中へくぐる */
const BUSY = "提出物 会議 部活 面談 成績 保護者 行事 校務 進路 清掃 出張 報告書 授業準備 課題 生徒指導 校外学習 採点 時間割 委員会 掲示物".split(" ");
const Wall = ({ f }) => {
  const appear = useSpring(f - 18, { damping: 200, stiffness: 90 }), dive = lerp(f, 58, 72, 0, 1, inCube);
  const dim = lerp(f, 12, 30, 1, .3);
  return (
    <Space p={1000} style={{ background: "#0d1336" }}>
      <World transform={`translateZ(${lerp(f, 0, 58, -120, 60)}px) rotateY(${lerp(f, 0, 58, -5, 5)}deg)`}>
        {Array.from({ length: 11 }).map((_, r) => (
          <div key={r} style={{ position: "absolute", top: -60 + r * 118, left: -700, whiteSpace: "nowrap", fontFamily: GOTHIC, fontWeight: r % 2 ? 900 : 500, fontSize: 96, color: `rgba(205,215,255,${dim * (r % 3 === 1 ? .95 : .55)})`, transform: `translateX(${(r % 2 ? -1 : 1) * (f * (3 + r * .3)) - 300 * (r % 2)}px)` }}>
            {Array.from({ length: 30 }).map((_, i) => BUSY[(i * 3 + r * 7) % BUSY.length]).join("　")}
          </div>
        ))}
      </World>
      <AbsoluteFill style={{ background: `rgba(6,9,30,${lerp(f, 12, 30, 0, .55)})` }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", transform: `scale(${(.72 + .28 * appear + beatPulse(f) * .012) * (1 + dive * dive * 60)})`, transformOrigin: "62% 50%" }}>
        <div style={{ fontFamily: MINCHO, fontWeight: 600, fontSize: 620, lineHeight: 1, color: "#fff", opacity: Math.min(1, appear * 2) }}>孤独</div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "#fff", opacity: lerp(f, 66, 72, 0, 1) }} />
    </Space>
  );
};

/* 3：白の中から、等幅の文字が1語ずつ跳ねる */
const Solved = ({ f }) => {
  const whip = lerp(f, 52, 66, 0, 1, inCube), tilt = lerp(f, 0, 60, -14, 10), pulse = beatPulse(f + 0);
  const words = [["AI", 0], ["で", 8], ["解けた。", 15]];
  return (
    <Space p={1300} style={{ background: "#f4fffc" }}>
      <AbsoluteFill style={{ transform: `translateX(${-whip * 2400}px) skewX(${-whip * 24}deg)`, transformStyle: "preserve-3d" }}>
        <World transform={`rotateY(${tilt * .7}deg) rotateX(6deg)`}>
          <div style={{ position: "absolute", inset: -240, fontFamily: MONO, fontSize: 62, lineHeight: 1.42, color: "rgba(0,150,140,.17)", wordBreak: "break-all", transform: `translateY(${-f * 5}px)` }}>
            {"完了 解決 OK 検索 要約 下書き 翻訳 集計 ".repeat(90)}
          </div>
          <div style={{ position: "absolute", left: -200, right: -200, top: 330, textAlign: "center", fontFamily: GOTHIC, fontWeight: 900, color: "#007a73", whiteSpace: "nowrap", transform: "translateZ(40px)" }}>
            {words.map(([w, d], i) => <Word key={i} c={w} f={f} delay={d} drop={260} style={{ fontSize: i === 2 ? 268 : 300, marginRight: 12 }} />)}
          </div>
        </World>
      </AbsoluteFill>
    </Space>
  );
};

/* 4：「届」が同僚と生徒へ向かうが、手前で止まり、残りの文字が崩れる */
const Unreached = ({ f }) => {
  const enter = lerp(f, 0, 12, 1, 0, outCube), reach = useSpring(f - 10, { damping: 26, stiffness: 60 }), fall = lerp(f, 34, 60, 0, 1, inCube), tilt = lerp(f, 58, 70, 0, 74, inCube);
  return (
    <Space p={1200} style={{ background: "linear-gradient(#050817, #161c44)" }}>
      <World transform={`translateX(${enter * 2400}px) rotateX(${tilt}deg) translateZ(${lerp(f, 0, 58, 0, 70)}px)`}>
        {[["colleague.png", 1000, 40], ["student.png", 1390, 120], ["senior.png", 690, 90]].map(([src, x, y], i) => (
          <div key={src} style={{ position: "absolute", left: x, top: y + Math.sin((f + i * 11) / 13) * 4, width: 760, height: 760, opacity: .38, filter: "brightness(.55) saturate(.55)", transform: `translateZ(${-110 * i}px)` }}><Pixel src={src} h={760} /></div>
        ))}
        <div style={{ position: "absolute", left: 120, top: 70, fontFamily: MINCHO, fontWeight: 600, fontSize: 220, color: "#d8def5" }}>{"人には、".split("").map((c, i) => <Word key={i} c={c} f={f} delay={8 + i * 3} />)}</div>
        <div style={{ position: "absolute", left: 120, top: 370, display: "flex", fontFamily: MINCHO, fontWeight: 800, color: "#fff" }}>
          <div style={{ fontSize: 520, lineHeight: 1, transform: `translateX(${reach * 330}px) scale(${.8 + reach * .2})`, textShadow: "0 0 60px rgba(120,160,255,.5)" }}>届</div>
          {"かない".split("").map((c, i) => <div key={i} style={{ fontSize: 240, alignSelf: "flex-end", marginLeft: i === 0 ? 340 : 0, opacity: f > 18 + i * 4 ? 1 - fall * .75 : 0, transform: `translateY(${fall * fall * (480 + i * 190)}px) rotate(${fall * (i - 1) * 42 + fall * 20}deg)` }}>{c}</div>)}
        </div>
      </World>
    </Space>
  );
};

/* 5：相棒が大きく呼吸し、声が言葉のかたまりになって次々に出てくる */
const WORDS = [["悩み", 1010, 250, "#e0568a"], ["頑張り", 1370, 300, "#148791"], ["困った", 960, 480, "#6c5ce0"], ["できた！", 1340, 510, "#c8740f"], ["助けて", 900, 720, "#238552"], ["ありがとう", 1240, 745, "#c9375a"]];
const Voice = ({ f }) => {
  const breathe = Math.sin(f / 11) * .018, cam = lerp(f, 0, 60, 1.0, 1.05, inOut), launch = lerp(f, T.swoosh - 240, T.swoosh - 240 + 16, 0, 1, inCube);
  const enter = lerp(f, 0, 12, 0, 1, outCube);
  return (
    <Space p={1100} style={{ background: "linear-gradient(135deg, #ffd9a8, #ffb3c7 55%, #b69cf0)" }}>
      <World transform={`rotateX(${(1 - enter) * -68}deg) scale(${cam}) rotateY(${lerp(f, 0, 78, 4, -3)}deg)`}>
        <div style={{ position: "absolute", left: -80, top: 40, width: 1050, height: 1050, transform: `scale(${1 + breathe}, ${1 - breathe}) translateY(${Math.sin(f / 11) * 8}px)`, transformOrigin: "50% 100%" }}><Pixel src="partner.png" h={1050} /></div>
        <div style={{ position: "absolute", left: 900, top: 44, whiteSpace: "nowrap", fontFamily: MARU, fontWeight: 800, fontSize: 132, color: "#4a1740", opacity: launch > .2 ? 1 - launch : 1 }}>
          {"声を、言葉に。".split("").map((c, i) => <Word key={i} c={c} f={f} delay={2 + i * 2} />)}
        </div>
        {WORDS.map(([w, x, y, col], i) => {
          const local = f - (T.pops[i] - 240), s = useSpring(local, { damping: 9, mass: .5, stiffness: 240 });
          if (local < 0) return null;
          const fly = lerp(f, T.swoosh - 240, T.swoosh - 240 + 16, 0, 1, inCube);
          return <div key={w} style={{ position: "absolute", left: x, top: y, padding: "14px 34px", fontFamily: GOTHIC, fontWeight: 900, fontSize: 84, color: "#fff", background: col, borderRadius: 26, border: "6px solid #2b1033", boxShadow: "9px 11px 0 #2b1033", whiteSpace: "nowrap", transform: `translateZ(${fly * 1300}px) translateX(${fly * (x - 1000) * .3}px) scale(${s}, ${1.25 - .25 * s}) rotate(${(i % 2 ? 1 : -1) * 4}deg)` }}>{w}</div>;
        })}
      </World>
    </Space>
  );
};

/* 6：言葉が届き、人の顔が明るくなる。花びらが画面を覆って次へ */
const Reach = ({ f }) => {
  const cam = lerp(f, 0, 78, 1.0, 1.08), wipe = lerp(f, 56, 78, 0, 1, inOut);
  const light = i => lerp(f, 6 + i * 6, 16 + i * 6, 0, 1);
  return (
    <Space p={1300} style={{ background: "linear-gradient(#ffe3ee, #fff4d9)" }}>
      <World transform={`scale(${cam}) rotateX(${lerp(f, 0, 78, 8, 2)}deg)`}>
        {[["student.png", -60, 330, 760], ["colleague.png", 560, 300, 800], ["senior.png", 1220, 330, 760]].map(([src, x, y, h], i) => (
          <div key={src} style={{ position: "absolute", left: x, top: y - Math.abs(Math.sin((f + i * 5) * Math.PI / T.beat)) * 22 * light(i), width: h, height: h, filter: `brightness(${.6 + .4 * light(i)}) saturate(${.5 + .5 * light(i)})` }}><Pixel src={src} h={h} /></div>
        ))}
        <div style={{ position: "absolute", left: -200, right: -200, top: 56, textAlign: "center", whiteSpace: "nowrap", fontFamily: GOTHIC, fontWeight: 900, fontSize: 208, color: "#c21e5f", WebkitTextStroke: "10px #fff", paintOrder: "stroke fill", transform: "translateZ(30px)" }}>
          {"人へ、届ける。".split("").map((c, i) => <Word key={i} c={c} f={f} delay={i * T.beat / 3} drop={200} />)}
        </div>
      </World>
      <Petals f={f} n={70} seed="r" from={2} speed={1.1} size={34} />
      <AbsoluteFill style={{ background: "#ffc9da", opacity: wipe * wipe }} />
    </Space>
  );
};

/* 7：満開の桜へ寄り、作品名が拍で跳ねる */
const Title = ({ f }) => {
  const zoom = lerp(f, 0, 78, 1.04, 1.16, inOut), reveal = lerp(f, 0, 14, 0, 1, outCube);
  return (
    <Space p={1600} style={{ background: "linear-gradient(#a8d8ff, #fff0f5 72%, #cfe8b0)" }}>
      <World transform={`scale(${zoom}) translateY(${Math.sin(f / 19) * 6}px)`}>
        <Img src={staticFile("school.jpg")} style={{ position: "absolute", inset: 0, width: 1920, height: 1080, objectFit: "cover", opacity: reveal }} />
      </World>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 46%, rgba(70,8,60,.68), rgba(70,8,60,.1) 78%)", opacity: reveal }} />
      <AbsoluteFill style={{ background: "#ffc9da", opacity: 1 - reveal }} />
      <Petals f={f} n={60} seed="t" from={-30} speed={.7} size={30} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", top: -40 }}>
        <div style={{ fontFamily: GOTHIC, fontWeight: 900, fontSize: 330, letterSpacing: ".04em", color: "#fff", WebkitTextStroke: "16px #6e1648", paintOrder: "stroke fill", lineHeight: 1.05, whiteSpace: "nowrap" }}>
          {"コエカタ".split("").map((c, i) => <Word key={i} c={c} f={f} delay={12 + i * 7.5} drop={280} />)}
        </div>
        <div style={{ marginTop: 24, fontFamily: GOTHIC, fontWeight: 900, fontSize: 118, color: "#fff", WebkitTextStroke: "12px #6e1648", paintOrder: "stroke fill", opacity: lerp(f, 26, 34, 0, 1), transform: `translateY(${lerp(f, 26, 40, 26, 0, outCube)}px)` }}>一人で抱えない。</div>
      </AbsoluteFill>
    </Space>
  );
};

const CUTS = { floor: Floor, wall: Wall, solved: Solved, unreached: Unreached, voice: Voice, reach: Reach, title: Title };
const Cut = ({ name }) => { const f = useCurrentFrame(), C = CUTS[name]; return <C f={f} />; };
export const Trial = () => (
  <AbsoluteFill style={{ background: "#000" }}>
    {Object.entries(T.cuts).map(([name, [a, b]]) => <Sequence key={name} from={a} durationInFrames={b - a} layout="none"><AbsoluteFill><Cut name={name} /></AbsoluteFill></Sequence>)}
    <Audio src={staticFile("music.wav")} volume={.8} />
    {T.voice.map(v => <Sequence key={v.id} from={v.at} layout="none"><Audio src={staticFile(`${v.id}.wav`)} volume={1.25} /></Sequence>)}
  </AbsoluteFill>
);
