/* 生成画像を使わず、コードだけで描いた背景。運営の回答に関わらず使える */
import { random } from "remotion";

const W = 1920, H = 1080;
const Svg = ({ children, style }) => <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", left: 0, top: 0, ...style }}>{children}</svg>;

/* 桜の枝：枝分かれを乱数で伸ばす */
function branches(seed, x, y, angle, len, depth, out = { limbs: [], blooms: [] }, id = "r") {
  const key = `${seed}${id}`, x2 = x + Math.cos(angle) * len, y2 = y + Math.sin(angle) * len;
  const bend = (random(key + "b") - .5) * len * .3;
  const cx = (x + x2) / 2 - Math.sin(angle) * bend, cy = (y + y2) / 2 + Math.cos(angle) * bend;
  out.limbs.push({ d: `M${x} ${y}Q${cx} ${cy} ${x2} ${y2}`, w: 1.2 + depth * depth * .55 });
  if (depth <= 3) {
    const n = 3 + Math.floor(random(key + "n") * 4);
    for (let i = 0; i < n; i++) {
      const t = random(`${key}t${i}`), r = random(`${key}r${i}`);
      out.blooms.push({ x: x + (x2 - x) * t + (r - .5) * 34, y: y + (y2 - y) * t + (random(`${key}s${i}`) - .5) * 34, r: 4 + random(`${key}z${i}`) * 6, a: .55 + random(`${key}a${i}`) * .45 });
    }
  }
  if (depth > 0) {
    const kids = depth > 3 ? 2 : 2 + Math.floor(random(key + "k") * 2);
    for (let i = 0; i < kids; i++) {
      const da = (i - (kids - 1) / 2) * (.55 + random(`${key}d${i}`) * .3);
      branches(seed, x2, y2, angle + da, len * (.66 + random(`${key}l${i}`) * .14), depth - 1, out, `${id}${i}`);
    }
  }
  return out;
}
const Sakura = ({ seed, x, y, angle, len, depth, limb, bloom, blur = 0 }) => {
  const t = branches(seed, x, y, angle, len, depth);
  return (
    <g style={{ filter: blur ? `blur(${blur}px)` : undefined }}>
      {t.limbs.map((l, i) => <path key={i} d={l.d} stroke={limb} strokeWidth={l.w} strokeLinecap="round" fill="none" />)}
      {t.blooms.map((b, i) => <circle key={i} cx={b.x} cy={b.y} r={b.r} fill={bloom} opacity={b.a} />)}
    </g>
  );
};

/* 夜の職員室：奥の机にだけ灯り（ランプは候補 A のカメラに合わせて右上） */
export const NightRoom = ({ lamp = 1 }) => {
  const LX = 1650, LY = 410;
  return (
    <Svg>
      <defs>
        <linearGradient id="nightSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0a1533" /><stop offset="1" stopColor="#121f44" /></linearGradient>
        <linearGradient id="wall" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#05060a" /><stop offset=".5" stopColor="#0a0b10" /><stop offset="1" stopColor="#14130f" /></linearGradient>
        <radialGradient id="glow" cx={LX} cy={LY + 90} r="560" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#ffc873" stopOpacity=".62" /><stop offset=".3" stopColor="#d98f3f" stopOpacity=".26" /><stop offset="1" stopColor="#d98f3f" stopOpacity="0" /></radialGradient>
        <linearGradient id="deskTop" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#2a2118" /><stop offset=".7" stopColor="#7c5a30" /><stop offset="1" stopColor="#4f3a22" /></linearGradient>
        <linearGradient id="curtain" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#181510" /><stop offset=".5" stopColor="#3b3225" /><stop offset="1" stopColor="#1d1912" /></linearGradient>
      </defs>
      <rect width={W} height={H} fill="url(#wall)" />
      {/* 窓と木の影 */}
      <rect x="1240" y="-20" width="640" height="470" fill="url(#nightSky)" />
      <g style={{ filter: "blur(5px)" }} fill="#05090f">
        {[[1320, 330, 110], [1420, 280, 140], [1560, 340, 100], [1700, 260, 150], [1830, 330, 120], [1270, 410, 90], [1620, 420, 110]].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} />)}
      </g>
      <g stroke="#17140f" fill="none"><path d="M1240 -20V450H1880V-20" strokeWidth="16" /><path d="M1450 -20V450M1665 -20V450" strokeWidth="11" /><path d="M1240 110H1880" strokeWidth="10" /></g>
      <rect x="1240" y="444" width="640" height="14" fill="#2c2318" />
      {[0, 1, 2, 3, 4].map(i => <rect key={i} x={1090 + i * 30} y="-10" width="31" height="462" fill="url(#curtain)" opacity=".85" />)}
      {/* 壁の棚 */}
      <rect x="860" y="150" width="215" height="440" fill="#0c0c0d" stroke="#16140f" strokeWidth="6" />
      <path d="M967 150V590M860 300H1075M860 445H1075" stroke="#16140f" strokeWidth="5" />
      {/* ランプの机 */}
      <rect x="1040" y="458" width="880" height="110" fill="#1b1711" />
      <path d="M1230 568H1880L1920 600H1210Z" fill="url(#deskTop)" />
      <rect x="1240" y="598" width="640" height="240" fill="#14110c" />
      <path d="M1640 610V830M1640 680H1880M1640 750H1880" stroke="#2c2519" strokeWidth="5" />
      <g transform="translate(1390 500)">
        {[0, 1, 2, 3, 4, 5, 6, 7].map(i => <rect key={i} x={(i % 3) * 3 - 3} y={72 - i * 8} width="170" height="7" fill={i % 2 ? "#efe4cd" : "#d9cdb3"} />)}
        <rect x="190" y="50" width="120" height="17" fill="#6d4628" /><rect x="185" y="67" width="132" height="20" fill="#3d3f4e" />
      </g>
      <g fill="none" stroke="#54493a"><path d={`M${LX + 95} 572C${LX + 95} 480 ${LX + 60} 410 ${LX + 8} ${LY}`} strokeWidth="9" /></g>
      <ellipse cx={LX + 95} cy="574" rx="48" ry="10" fill="#54493a" />
      <path d={`M${LX - 55} ${LY + 24}Q${LX - 30} ${LY - 34} ${LX + 22} ${LY - 22}L${LX + 44} ${LY + 22}Z`} fill="#2f2a22" />
      <ellipse cx={LX - 6} cy={LY + 24} rx="50" ry="9" fill="#fff0ca" opacity={.75 + lamp * .25} />
      <rect width={W} height={H} fill="url(#glow)" opacity={lamp} />
      {/* 手前の机と椅子は影 */}
      <g fill="#07070a">
        <path d="M820 760L1120 690H1560L1400 790H820Z" fill="#14100c" />
        <rect x="820" y="790" width="580" height="290" />
        <path d="M1100 870L1440 800H1920V1080H1100Z" fill="#100d0a" />
        <path d="M1495 910C1495 845 1540 815 1620 815H1760C1850 815 1880 860 1880 930V1080H1495Z" />
        <path d="M1350 680C1350 605 1385 590 1440 590H1520C1580 590 1610 620 1610 690V820H1350Z" />
        <path d="M985 640C985 575 1020 555 1075 555H1140C1200 555 1225 590 1225 650V790H985Z" fill="#0a090b" />
      </g>
      <rect x="0" y="0" width="880" height={H} fill="#040509" opacity=".8" />
    </Svg>
  );
};

/* 朝の廊下：一点透視。左の窓から光が入り、床に帯ができる */
export const MorningCorridor = () => {
  const VX = 1250, VY = 440;
  const at = (x, y, t) => [x + (VX - x) * t, y + (VY - y) * t];
  const P = (...pts) => pts.map(p => p.join(",")).join(" ");
  const depth = t => 1 - Math.pow(.56, t);
  const windows = [0, 1, 2, 3, 4, 5];
  return (
    <Svg>
      <defs>
        <linearGradient id="dawn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f7dfd4" /><stop offset=".65" stopColor="#fdeedd" /><stop offset="1" stopColor="#d8d4cf" /></linearGradient>
        <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8f8880" /><stop offset="1" stopColor="#46413f" /></linearGradient>
        <linearGradient id="ceil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5e5a56" /><stop offset="1" stopColor="#b5ada5" /></linearGradient>
        <linearGradient id="rwall" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#c0b6ac" /><stop offset="1" stopColor="#6e6864" /></linearGradient>
        <linearGradient id="lwall" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#3f3b3b" /><stop offset="1" stopColor="#88817b" /></linearGradient>
        <radialGradient id="sun" cx="170" cy="210" r="560" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#fff4dc" stopOpacity=".95" /><stop offset=".35" stopColor="#ffdcc4" stopOpacity=".42" /><stop offset="1" stopColor="#ffdcc4" stopOpacity="0" /></radialGradient>
        <clipPath id="panes"><polygon points={P(at(-30, -80, 0), at(-30, 660, 0), at(-30, 660, .92), at(-30, -80, .92))} /></clipPath>
      </defs>
      <rect width={W} height={H} fill="#8a837c" />
      <polygon points={P([-30, -80], [W + 30, -80], at(W + 30, -80, .9), at(-30, -80, .9))} fill="url(#ceil)" />
      <polygon points={P(at(W + 30, -80, 0), at(W + 30, H + 30, 0), at(W + 30, H + 30, .9), at(W + 30, -80, .9))} fill="url(#rwall)" />
      <polygon points={P([-30, H + 30], [W + 30, H + 30], at(W + 30, H + 30, .9), at(-30, H + 30, .9))} fill="url(#floor)" />
      <polygon points={P([-30, -80], [-30, H + 30], at(-30, H + 30, .9), at(-30, -80, .9))} fill="url(#lwall)" />
      {/* 奥の窓 */}
      <polygon points={P(at(-30, 40, .9), at(W + 30, 40, .9), at(W + 30, 700, .9), at(-30, 700, .9))} fill="url(#dawn)" />

      {/* 左の窓：外の桜が透ける */}
      <polygon points={P(at(-30, -80, 0), at(-30, 660, 0), at(-30, 660, .92), at(-30, -80, .92))} fill="url(#dawn)" />
      <g clipPath="url(#panes)">
        <Sakura seed="far" x={880} y={760} angle={-1.9} len={190} depth={5} limb="#b6a29c" bloom="#f4d6d8" blur={5} />
        <Sakura seed="near" x={-90} y={820} angle={-.72} len={270} depth={6} limb="#6f5851" bloom="#f2bfca" blur={1.2} />
      </g>
      {windows.map(i => {
        const a = depth(i), b = depth(i + 1), m = (a + b) / 2;
        return (
          <g key={i} fill="#4d4842">
            <polygon points={P(at(-30, -80, a), at(-30, 660, a), at(14, 660, a), at(14, -80, a))} />
            <polygon points={P(at(-30, 150, a), at(-30, 165, a), at(-30, 165, b), at(-30, 150, b))} />
            <polygon points={P(at(-30, 650, a), at(-30, 690, a), at(-30, 690, b), at(-30, 650, b))} fill="#6b655e" />
            <polygon points={P(at(-30, -80, m), at(-30, 660, m), at(-14, 660, m), at(-14, -80, m))} fill="#6b655e" />
          </g>
        );
      })}

      {/* 右の教室の戸 */}
      {windows.map(i => {
        const a = depth(i * .85 + .25), b = depth(i * .85 + .78);
        return <polygon key={i} points={P(at(W + 30, 170, a), at(W + 30, 900, a), at(W + 30, 900, b), at(W + 30, 170, b))} fill="#5c5650" opacity=".62" />;
      })}
      {/* 蛍光灯 */}
      {[.3, .55, .72, .82].map(t => <polygon key={t} points={P(at(760, -80, t), at(1000, -80, t), at(1000, -80, t + .05), at(760, -80, t + .05))} fill="#d8d3cb" />)}

      {/* 床の光の帯 */}
      <g style={{ filter: "blur(7px)", mixBlendMode: "screen" }} fill="#ffc9a3">
        {[0, 1, 2, 3, 4, 5].map(i => {
          const a = depth(i + .15), b = depth(i + .78), sp = 1500;
          return <polygon key={i} opacity={.62 - i * .05} points={P(at(-30, H + 30, a), at(sp, H + 30, a * .92), at(sp, H + 30, b * .92), at(-30, H + 30, b))} />;
        })}
      </g>
      <rect width={W} height={H} fill="url(#sun)" style={{ mixBlendMode: "screen" }} />
    </Svg>
  );
};

/* 便箋：紙の繊維と罫線をコードで描く。cell は文字の列の幅に合わせる */
export const LetterPaper = ({ cell, right }) => (
  <Svg>
    <defs>
      <filter id="fiber" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".012 .34" numOctaves="3" seed="4" /><feColorMatrix values="0 0 0 0 1  0 0 0 0 .98  0 0 0 0 .92  .9 0 0 0 -.33" /></filter>
      <filter id="mottle" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".006" numOctaves="4" seed="9" /><feColorMatrix values="0 0 0 0 .6  0 0 0 0 .52  0 0 0 0 .38  .5 0 0 0 -.15" /></filter>
    </defs>
    <rect width={W} height={H} fill="#ece4d4" />
    <rect width={W} height={H} filter="url(#mottle)" opacity=".5" />
    <rect width={W} height={H} filter="url(#fiber)" opacity=".5" />
    {Array.from({ length: 18 }).map((_, i) => { const x = right + cell / 2 - i * cell; return <path key={i} d={`M${x} 0V${H}`} stroke="#a89a82" strokeOpacity=".42" strokeWidth="1.5" />; })}
  </Svg>
);

/* 桜だけの夕景：候補 D の作品名の背景 */
export const SakuraDusk = () => (
  <Svg>
    <defs><linearGradient id="dusk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#161c33" /><stop offset=".62" stopColor="#3b3a55" /><stop offset="1" stopColor="#7d6470" /></linearGradient></defs>
    <rect width={W} height={H} fill="url(#dusk)" />
    <Sakura seed="back" x={1990} y={1130} angle={-2.25} len={270} depth={6} limb="#2a2638" bloom="#9f8096" blur={4} />
    <Sakura seed="front" x={-70} y={1100} angle={-.85} len={330} depth={7} limb="#171522" bloom="#e6bcc7" blur={.6} />
  </Svg>
);
