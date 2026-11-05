import type { TrophyArt } from "@/lib/ribbons";
import type { TrophyCategory, TrophyEmblem } from "@/lib/trophies";
import "./trophies.css";

/** トロフィーの絵。Codex の絵に頼らず、コードで描く。系統で色を変え、杯の上に印を付ける。 */
const COLORS: Record<TrophyCategory, { color: string; accent: string }> = {
  help: { color: "#ff5a3c", accent: "#fff" },
  connect: { color: "#18a96b", accent: "#fff" },
  words: { color: "#2545f0", accent: "#ffd23c" },
  failure: { color: "#8a4dff", accent: "#ffd23c" },
  together: { color: "#ff4d8d", accent: "#fff" },
  effort: { color: "#ff8a1f", accent: "#fff" },
  humor: { color: "#0d8fa8", accent: "#fff" },
  hidden: { color: "#c99400", accent: "#fff" },
  event: { color: "#ff8a1f", accent: "#fff" },
};

const EMBLEMS: Record<TrophyEmblem, string> = {
  speech: "M-13 -10h26v16h-14l-8 8v-8h-4z",
  heart: "M0 14C-18 2-14-12-5-12c3 0 5 2 5 4 0-2 2-4 5-4 9 0 13 14-5 26z",
  bulb: "M0-15C8-15 12-9 12-4c0 5-4 7-5 11H-7c-1-4-5-6-5-11 0-5 4-11 12-11zM-5 10H5v4H-5z",
  arrow: "M-14-3H4V-10L15 0 4 10V3H-14z",
  pen: "M-11 13-8 3 6-11 13-4-1 10zM8-13 11-16 16-11 13-8z",
  star: "M0-15 4-5 15-5 6 2 9 13 0 7-9 13-6 2-15-5-4-5z",
  seed: "M-2 14V2C-10 2-13-4-13-12-5-12-1-8 0-3 2-9 6-13 13-13 13-5 9 2 2 2V14z",
  clock: "M0-14A14 14 0 1 1 0 14 14 14 0 1 1 0-14zM-2-9V2L7 7 9 4 2 0V-9z",
  people: "M-7-13A5 5 0 1 1-7-3 5 5 0 1 1-7-13zM7-13A5 5 0 1 1 7-3 5 5 0 1 1 7-13zM-14 12C-14 4-11 0-7 0S0 4 0 12zM1 12C1 4 3 0 7 0S14 4 14 12z",
  flag: "M-10-15H-6V15H-10zM-6-13H13L7-6 13 1H-6z",
  book: "M-14-11C-8-13-3-12 0-9 3-12 8-13 14-11V11C8 9 3 10 0 13-3 10-8 9-14 11z",
  wrench: "M13-12 6-5 3-8 10-15C4-17-3-13-3-6L-13 6C-15 9-10 14-7 12L4 2C11 3 15-5 13-12z",
  flower: "M0-15A5.5 5.5 0 0 1 5-5 5.5 5.5 0 1 1 3 4 5.5 5.5 0 1 1-3 4 5.5 5.5 0 1 1-5-5 5.5 5.5 0 0 1 0-15z",
  question: "M-9-6C-9-12-5-15 0-15S10-12 10-6C10 0 3 0 3 6H-3C-3-2 4-2 4-6 4-8 2-9 0-9S-3-8-3-5zM-3 9H3V15H-3z",
};

const CUP = "M-15-23H15V-3C15 8 7 12 3 13V18H10V24H-10V18H-3V13C-7 12-15 8-15-3z";
const HANDLES = "M-15-19H-24V-11C-24-4-20-1-15-1V-6C-18-6-19-8-19-11V-14H-15zM15-19H24V-11C24-4 20-1 15-1V-6C18-6 19-8 19-11V-14H15z";

export function Sticker({ art }: { art: TrophyArt }) {
  const { color, accent } = COLORS[art.category];
  return (
    <svg className="ribbon-sticker trophy-cup" viewBox="-30 -30 60 60" aria-hidden="true">
      <path className="trophy-cup-body" d={HANDLES} fill={color} stroke="#111" strokeWidth="1.5" />
      <path className="trophy-cup-body" d={CUP} fill={color} stroke="#111" strokeWidth="1.5" />
      <path className="trophy-emblem" d={EMBLEMS[art.emblem]} fill={accent} transform="translate(0 -6) scale(0.6)" />
    </svg>
  );
}

/** まだ取っていない枠の影。 */
export function StickerShadow() {
  return (
    <svg className="ribbon-sticker trophy-cup trophy-shadow" viewBox="-30 -30 60 60" aria-hidden="true">
      <path d={HANDLES} />
      <path d={CUP} />
    </svg>
  );
}
