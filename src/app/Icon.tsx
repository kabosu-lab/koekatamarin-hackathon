/** このアプリ専用の線のアイコン。意味は隣の文字が伝えるので、読み上げには出さない。必ず文字と並べて使う。 */
const PATHS = {
  talk: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z M5 11a7 7 0 0 0 14 0 M12 18v3",
  stop: "M7 7h10v10H7Z",
  write: "M4 20l1-4L16 5l3 3L8 19l-4 1Z M14 7l3 3",
  people: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6 M16 5.3a3 3 0 0 1 0 5.4 M17 14.3c2.4.7 4 2.9 4 5.7",
  me: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8",
  inbox: "M4 13l2.5-8h11L20 13v6H4v-6Z M4 13h5l1 2h4l1-2h5",
  attach: "M20 11.5l-8.2 8.2a5 5 0 0 1-7-7L13 4.4a3.3 3.3 0 0 1 4.7 4.7l-8.2 8.2a1.7 1.7 0 0 1-2.4-2.4l7.6-7.5",
  walk: "M13 5.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z M10 21l2-6-2.5-2.5L11 8l3 3 3 1 M9.5 12.5L7 11l4-3 M14 15l2 6",
  settings: "M4 7h9 M17 7h3 M15 5v4 M4 17h3 M11 17h9 M9 15v4",
  soundOn: "M4 10v4h3l5 4V6L7 10H4Z M15.5 9a4 4 0 0 1 0 6 M18 6.5a8 8 0 0 1 0 11",
  soundOff: "M4 10v4h3l5 4V6L7 10H4Z M16 10l4 4 M20 10l-4 4",
  back: "M11 5l-7 7 7 7 M4 12h16",
  send: "M4 12l16-8-5 16-3-7-8-1Z M12 13l8-9",
  cancel: "M6 6l12 12 M18 6L6 18",
  check: "M5 12l5 5 9-10",
  heart: "M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10C19.5 15.400 12 20 12 20Z",
  book: "M12 6.500C10 5 7 4.500 4 5v14c3-.5 6 0 8 1.500 2-1.500 5-2 8-1.500V5c-3-.5-6 0-8 1.500Z M12 6.500v14",
  idea: "M9 18h6 M10 21h4 M12 3a6 6 0 0 0-3.500 10.900c.6.5 1 1.200 1 2.100h5c0-.9.4-1.600 1-2.100A6 6 0 0 0 12 3Z",
  chat: "M4 5h16v11H9l-5 4V5Z M8 9h8 M8 12.500h5",
  note: "M6 3h12v18H6V3Z M9 8h6 M9 12h6 M9 16h4",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 7v5l3 2",
  shield: "M12 3l8 3v6c0 4.500-3.300 7.800-8 9-4.700-1.200-8-4.500-8-9V6l8-3Z",
  gift: "M4 9h16v4H4V9Z M6 13v8h12v-8 M12 9v12 M12 9S9 3 7 5s1 4 5 4Z M12 9s3-6 5-4-1 4-5 4Z",
  flag: "M6 21V4 M6 4h12l-3 4 3 4H6",
  thanks: "M4 6h16v12H4V6Z M4 7l8 6 8-6",
  star: "M12 3.500l2.600 5.400 5.900.8-4.300 4.100 1 5.900-5.200-2.800-5.200 2.800 1-5.900L3.500 9.700l5.900-.8L12 3.500Z",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" width="1.25em" height="1.25em" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
