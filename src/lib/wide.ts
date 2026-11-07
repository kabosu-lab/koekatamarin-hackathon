/**
 * 0-2y：横向きでは、どの画面でも3列（左＝履歴と設定、中央＝話す、右＝みんな）。
 * 奥の画面は、それが属する列の中で開く。
 *
 * 3列にするかの決まり（0-2y (6)）。幅では決めず、横向きで高さが 600px 以上なら必ず3列。
 * 判定の元は retro.css の末尾の「0-2y (6)」の @media 1か所で、ここはそれと同じ式（JS で読むときに使う）。変えるときは両方を変える。
 * iPhone の横（844×390）は高さが足りないので3列にしない（縦にして使ってもらう）。
 */
export const WIDE_QUERY = "(orientation: landscape) and (min-height: 600px)";

export type WideSide = "left" | "right";

/** 左の列（履歴と設定）に属する画面。ここにないものは右の列（みんな） */
const LEFT_PREFIXES = ["/me", "/daily", "/lookback", "/portfolio", "/log", "/yousu", "/walk", "/soudan"];

const startsWithPath = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

/** その画面が属する列。話す画面（ホーム）は真ん中なので null */
export function wideSide(pathname: string): WideSide | null {
  if (pathname === "/" || pathname === "") return null;
  return LEFT_PREFIXES.some((prefix) => startsWithPath(pathname, prefix)) ? "left" : "right";
}

/** 列の中に開いてよい行き先か（同じサイトの奥の画面だけ。話す画面そのものは列に入れない） */
export function isColumnPath(href: string): boolean {
  if (!href.startsWith("/") || href.startsWith("//") || href.includes("\\")) return false;
  const pathname = href.split(/[?#]/)[0];
  return wideSide(pathname) !== null && !pathname.startsWith("/api/");
}

/** 広い画面で奥の画面を開いたときの行き先。ホームの3列の、属する列の中に開く */
export function wideHomeUrl(href: string): string {
  const pathname = href.split(/[?#]/)[0];
  const side = wideSide(pathname);
  if (!side || !isColumnPath(href)) return href;
  return `/?${side}=${encodeURIComponent(href)}`;
}

/** 列の初めの中身。指定がなければ、左は履歴と設定、右はみんな */
export function columnSrc(side: WideSide, requested: string | string[] | undefined): string {
  const fallback = side === "left" ? "/me" : "/minna";
  if (typeof requested !== "string" || !isColumnPath(requested)) return fallback;
  return wideSide(requested.split(/[?#]/)[0]) === side ? requested : fallback;
}

/**
 * <head> の中で、描く前に1回だけ動く小さなスクリプト。
 * (1) 欄（iframe）の中なら html に data-embed を付ける（最初の描画から欄の見た目にする）
 * (2) 広い画面で奥の画面を直接開いたら、描く前にホームの3列の、その列の中へ移す
 * 3列かどうかは CSS と同じメディアクエリで決める。
 */
export function wideBootScript(): string {
  return `(function(){try{var d=document.documentElement;if(window.self!==window.top){var f=window.frameElement;if(f&&f.getAttribute("data-mode")==="pane")d.dataset.pane="true";else d.dataset.embed="true";return}var p=location.pathname;if(p==="/"||p.indexOf("/api/")===0)return;if(!window.matchMedia(${JSON.stringify(WIDE_QUERY)}).matches)return;var L=${JSON.stringify(LEFT_PREFIXES)};var s="right";for(var i=0;i<L.length;i++){if(p===L[i]||p.indexOf(L[i]+"/")===0){s="left";break}}d.dataset.wideAway="true";location.replace("/?"+s+"="+encodeURIComponent(p+location.search+location.hash))}catch(e){}})();`;
}
