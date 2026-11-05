import type { RoomPlace } from "./scene";

/** 景色はすべてコードで描く。絵のファイルも文字も使わない。色は room.css の変数で時間に合わせる。 */
const BOOK_COLORS = ["#a6432f", "#2f5d73", "#c28f2c", "#4f7a4c", "#7a4a78", "#d9cdb4", "#33415c", "#b5653a"];

/** 本棚の本。乱数を使わず、番号から決める（サーバーの描き直しで絵が変わらないように）。 */
function Shelf({ x, width }: { x: number; width: number }) {
  const rows = [28, 92, 156, 220];
  return (
    <g>
      <rect x={x} y={0} width={width} height={290} fill="var(--room-wood-dark)" />
      {rows.map((y, row) => {
        const books = [];
        let bookX = x + 8;
        let index = row * 3 + Math.round(x);
        while (bookX < x + width - 14) {
          const bookWidth = 8 + ((index * 7) % 7);
          const bookHeight = 38 + ((index * 5) % 15);
          books.push(
            <rect
              key={index}
              x={bookX}
              y={y + 52 - bookHeight}
              width={bookWidth}
              height={bookHeight}
              rx={1}
              fill={BOOK_COLORS[index % BOOK_COLORS.length]}
            />,
          );
          bookX += bookWidth + 1;
          index += 1;
        }
        return (
          <g key={y}>
            {books}
            <rect x={x} y={y + 52} width={width} height={8} fill="var(--room-wood)" />
          </g>
        );
      })}
    </g>
  );
}

function Library() {
  return (
    <>
      <defs>
        <linearGradient id="room-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--room-sky-top)" />
          <stop offset="1" stopColor="var(--room-sky-bottom)" />
        </linearGradient>
        <linearGradient id="room-shaft" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--room-light)" stopOpacity="0" />
          <stop offset="0.2" stopColor="var(--room-light)" stopOpacity="0.45" />
          <stop offset="1" stopColor="var(--room-light)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="800" height="340" fill="var(--room-wall)" />
      {[250, 355, 460].map((x) => (
        <g key={x}>
          <path d={`M${x} 250V90a45 45 0 0 1 90 0v160z`} fill="url(#room-sky)" />
          <path d={`M${x + 45} 45v205M${x} 120h90M${x} 185h90`} stroke="var(--room-wood)" strokeWidth="4" fill="none" />
          <path d={`M${x} 250V90a45 45 0 0 1 90 0v160z`} stroke="var(--room-wood-dark)" strokeWidth="6" fill="none" />
        </g>
      ))}
      <Shelf x={0} width={225} />
      <Shelf x={575} width={225} />
      <path d="M640 40l-28 250M690 40l-28 250M634 92h50M626 160h50M618 228h50" stroke="var(--room-wood)" strokeWidth="6" fill="none" />
      <rect y="290" width="800" height="50" fill="var(--room-wainscot)" />
      <g className="room-shaft">
        <path d="M250 110h90l150 230H330z" fill="url(#room-shaft)" />
        <path d="M355 110h90l150 230H435z" fill="url(#room-shaft)" />
        <path d="M460 110h90l150 230H540z" fill="url(#room-shaft)" />
      </g>
      {[
        [320, 170],
        [392, 230],
        [448, 150],
        [520, 250],
        [560, 190],
        [290, 260],
      ].map(([x, y], index) => (
        <circle
          key={x}
          className="room-mote"
          cx={x}
          cy={y}
          r={index % 2 === 0 ? 2.5 : 1.8}
          fill="var(--room-light)"
          style={{ animationDelay: `${-index * 2.3}s` }}
        />
      ))}
    </>
  );
}

function Classroom() {
  return (
    <>
      <defs>
        <linearGradient id="room-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--room-sky-top)" />
          <stop offset="0.7" stopColor="var(--room-sky-bottom)" />
        </linearGradient>
        <radialGradient id="room-shaft" gradientUnits="userSpaceOnUse" cx="300" cy="190" r="520">
          <stop offset="0" stopColor="var(--room-light)" stopOpacity="0.42" />
          <stop offset="1" stopColor="var(--room-light)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="800" height="340" fill="var(--room-wall)" />
      <rect x="60" y="32" width="300" height="228" fill="url(#room-sky)" />
      <circle cx="170" cy="196" r="34" fill="#ffd98a" />
      <path d="M60 260v-46q60-34 124-10t176-14v70z" fill="#6d3f46" />
      <path d="M60 260v-22h40v-16h46v18h60v-10h52v14h102v16z" fill="#4c2c3a" />
      <path d="M160 32v228M260 32v228M60 132h300" stroke="var(--room-wood-dark)" strokeWidth="5" />
      <rect x="60" y="32" width="300" height="228" fill="none" stroke="var(--room-wood-dark)" strokeWidth="8" />
      <rect x="48" y="258" width="324" height="10" fill="var(--room-wood)" />
      <path className="room-curtain" d="M60 26h46q-10 110 6 236H60z" fill="var(--room-curtain)" />
      <path className="room-curtain" d="M360 26h-40q12 120-6 236h46z" fill="var(--room-curtain)" style={{ animationDelay: "-5s" }} />
      <rect x="418" y="66" width="340" height="166" rx="4" fill="#27503f" stroke="var(--room-wood-dark)" strokeWidth="9" />
      <path d="M452 118q70-26 130 0t110-8M470 182q80 18 170-4" stroke="#fff" strokeOpacity="0.12" strokeWidth="16" fill="none" strokeLinecap="round" />
      <rect x="436" y="232" width="304" height="8" fill="var(--room-wood)" />
      <rect x="680" y="225" width="26" height="7" rx="1" fill="#f5efe0" />
      <rect x="648" y="225" width="22" height="7" rx="1" fill="#f2b8a8" />
      <circle cx="588" cy="34" r="22" fill="#fff8ea" stroke="var(--room-wood-dark)" strokeWidth="4" />
      <path d="M588 34v-14M588 34l-11 7" stroke="#3a2b28" strokeWidth="3" strokeLinecap="round" />
      <rect y="290" width="800" height="50" fill="var(--room-wainscot)" />
      {[120, 300, 500, 680].map((x) => (
        <g key={x} fill="var(--room-wood-dark)" opacity="0.55">
          <rect x={x - 42} y={298} width={84} height={9} rx={2} />
          <rect x={x - 34} y={307} width={6} height={33} />
          <rect x={x + 28} y={307} width={6} height={33} />
        </g>
      ))}
      <rect className="room-shaft" width="800" height="340" fill="url(#room-shaft)" />
    </>
  );
}

function Cafe() {
  return (
    <>
      <defs>
        <linearGradient id="room-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--room-sky-top)" />
          <stop offset="1" stopColor="var(--room-sky-bottom)" />
        </linearGradient>
        <radialGradient id="room-lamp">
          <stop offset="0" stopColor="var(--room-light)" stopOpacity="0.75" />
          <stop offset="1" stopColor="var(--room-light)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="800" height="340" fill="var(--room-wall)" />
      <rect x="82" y="46" width="330" height="222" rx="4" fill="url(#room-sky)" />
      {[
        [122, 212, 11, "#f7c76b"],
        [172, 182, 7, "#ff9d7a"],
        [216, 226, 14, "#f7c76b"],
        [270, 196, 8, "#9fc9ff"],
        [318, 228, 12, "#ffd89a"],
        [372, 190, 9, "#ff9d7a"],
        [146, 240, 8, "#9fc9ff"],
        [346, 244, 7, "#f7c76b"],
      ].map(([x, y, r, fill], index) => (
        <circle
          key={`${x}`}
          className="room-twinkle"
          cx={x}
          cy={y}
          r={r}
          fill={fill as string}
          style={{ animationDelay: `${-index * 1.9}s` }}
        />
      ))}
      <circle cx="340" cy="92" r="17" fill="#f3ecd2" />
      <path d="M192 46v222M302 46v222" stroke="var(--room-wood-dark)" strokeWidth="5" />
      <rect x="82" y="46" width="330" height="222" rx="4" fill="none" stroke="var(--room-wood-dark)" strokeWidth="8" />
      <rect x="74" y="266" width="346" height="10" fill="var(--room-wood)" />

      <rect x="462" y="74" width="320" height="8" fill="var(--room-wood)" />
      <rect x="462" y="146" width="320" height="8" fill="var(--room-wood)" />
      {[484, 526, 568, 610, 652, 694, 736].map((x, index) => (
        <g key={x}>
          <path d={`M${x} 74v-${22 + (index % 3) * 8}h14v${22 + (index % 3) * 8}z`} fill={["#6e8f7a", "#b5653a", "#d9cdb4"][index % 3]} />
          <path d={`M${x} 146v-18q0-6 6-6h12q6 0 6 6v18z`} fill="#efe6d4" opacity={index % 2 === 0 ? 1 : 0.7} />
        </g>
      ))}
      <rect x="450" y="232" width="350" height="108" fill="var(--room-wood-dark)" />
      <rect x="440" y="222" width="360" height="12" fill="var(--room-wood)" />
      <path d="M560 222v-46h74v46zM576 196h42" fill="#8d9499" stroke="#62686d" strokeWidth="3" />

      <path d="M34 340V286q-20-24 2-46 2 26 12 38 0-38 24-52-4 34-6 62 14-10 26-10-14 18-18 62z" fill="#3f6048" />

      {[220, 450, 660].map((x, index) => (
        <g key={x}>
          <circle className="room-lamp-glow" cx={x} cy={84} r={86} fill="url(#room-lamp)" style={{ animationDelay: `${-index * 3}s` }} />
          <path d={`M${x} 0v52`} stroke="#14100e" strokeWidth="2.5" />
          <path d={`M${x - 22} 76q2-24 22-24t22 24z`} fill="#14100e" />
          <ellipse cx={x} cy={76} rx={13} ry={4} fill="#ffe2a6" />
        </g>
      ))}
      <rect y="300" width="450" height="40" fill="var(--room-wainscot)" />
    </>
  );
}

const SCENES = { library: Library, classroom: Classroom, cafe: Cafe };

export function RoomBackdrop({ place, label }: { place: RoomPlace; label: string }) {
  const Scene = SCENES[place];
  return (
    <svg className="room-backdrop" viewBox="0 0 800 340" preserveAspectRatio="xMidYMax slice" role="img" aria-label={label}>
      <Scene />
    </svg>
  );
}
