/** リボンのシール。Codex の絵に頼らず、コードで描く。 */
const STYLES: Record<string, { color: string; accent: string; icon: string }> = {
  "first-answer": { color: "#ff5a3c", accent: "#ffd23c", icon: "M-13 -10h26v16h-14l-8 8v-8h-4z" },
  thanks: { color: "#ff4d8d", accent: "#fff", icon: "M0 14C-18 2-14-12-5-12c3 0 5 2 5 4 0-2 2-4 5-4 9 0 13 14-5 26z" },
  "knowledge-helped": { color: "#2545f0", accent: "#ffd23c", icon: "M0-15C8-15 12-9 12-4c0 5-4 7-5 11H-7c-1-4-5-6-5-11 0-5 4-11 12-11zM-5 10H5v4H-5z" },
  pass: { color: "#18a96b", accent: "#fff", icon: "M-14-3H4V-10L15 0 4 10V3H-14z" },
  "note-helped": { color: "#8a4dff", accent: "#ffd23c", icon: "M-11 13-8 3 6-11 13-4-1 10zM8-13 11-16 16-11 13-8z" },
};
const EVENT_STYLE = { color: "#ff8a1f", accent: "#fff", icon: "M0-15 4-5 15-5 6 2 9 13 0 7-9 13-6 2-15-5-4-5z" };

export function stickerStyle(id: string) {
  return STYLES[id] ?? EVENT_STYLE;
}

/** シールの中身。中心が (0,0) で半径 28。 */
export function StickerShape({ id }: { id: string }) {
  const { color, accent, icon } = stickerStyle(id);
  return (
    <>
      <circle r="28" fill="#fff" stroke="#111" strokeWidth="2" />
      <circle r="23" fill={color} />
      <path d={icon} fill={accent} />
    </>
  );
}

export function Sticker({ id }: { id: string }) {
  return (
    <svg className="ribbon-sticker" viewBox="-30 -30 60 60" aria-hidden="true">
      <StickerShape id={id} />
    </svg>
  );
}
