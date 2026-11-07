"use client";

import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { isColumnPath, WIDE_QUERY, type WideSide, wideHomeUrl, wideSide } from "@/lib/wide";
import { collapseColumn } from "./so-far-full";
import { showStrip, strip } from "./strip";

/** 列の中身を外から替える知らせ（欄の中のリンクが、もう片方の列で開くとき） */
const COLUMN_EVENT = "koekata:wide-column";
type ColumnRequest = { side: WideSide; href: string };

const isWide = () => window.matchMedia(WIDE_QUERY).matches;

/** 列の中で開けるなら開く（広い画面の外側で、列に属する画面へ向かうとき）。開いたら true */
function openInColumn(href: string): boolean {
  if (window.self !== window.top || !isWide() || !isColumnPath(href)) return false;
  const side = wideSide(href.split(/[?#]/)[0]);
  if (!side) return false;
  window.dispatchEvent(new CustomEvent<ColumnRequest>(COLUMN_EVENT, { detail: { side, href } }));
  return true;
}

/**
 * 話す画面から別の画面を開く（ホイールのチップなど）。0-2y：横向きの3列では、外側ごと移らず、属する列の中で開く。
 * 狭い画面では今までどおり push する。
 */
export function openScreenFromHome(href: string, push: (href: string) => void) {
  // 0-2z：狭い画面では、みんな・履歴と設定は帯を動かして開く（読み込み直さない）
  if (!openInColumn(href) && !strip.go(href)) push(href);
}

/** 狭い画面で、話す画面の左右の画面を裏で読み込み始めるまでの待ち（最初の描画と操作を先にする） */
const PANE_DELAY_MS = 1500;

/**
 * 広い画面では、話す画面の左右に同じ画面を並べる。欄の中のリンクは欄の中で動き、真ん中の機器は保たれる。
 * 列の枠はサーバーで描き、出すかどうかは CSS のメディアクエリで決める（0-2y。最初の描画から3列）。
 *
 * 0-2z：狭い画面でも、同じ枠に左右の画面を裏で読み込んでおき、画面の外（左右）に置く（data-mode="pane"）。
 * スワイプの途中は、この本物の画面が指に付いて覗く。中は単独で開いたときと同じ見た目（欄の印 data-embed は付けない）。
 */
/**
 * 0-2z：話す画面の帯の入れ物。止まっている位置（data-pane）は、最初の描画だけサーバーの ?pane= から決め、
 * そのあとは strip.ts が付け替える（読み直しの木が遅れて届いても、React が位置を書き戻さないように、値を固定する）。
 * 描いたあと（作り直されたときも）は、URL の ?pane= に合わせる。
 */
export function DeviceRow({ pane, children }: { pane?: "left" | "right"; children: ReactNode }) {
  const [initial] = useState(pane);
  useEffect(() => {
    showStrip();
  }, []);
  return (
    <div className="device-row" data-pane={initial}>
      {children}
    </div>
  );
}

export function WidePanel({ src, title, side, shown: shownProp = false }: { src: string; title: string; side: WideSide; shown?: boolean }) {
  // 最初の描画のときの値だけを使う（あとの付け替えは strip.ts）
  const [shown] = useState(shownProp);
  const [wide, setWide] = useState(false);
  const [pane, setPane] = useState(false);
  // 同じ画面をもう一度開いたときも、列の中を開き直す（奥の状態から戻す）
  const [current, setCurrent] = useState({ href: src, turn: 0 });
  useEffect(() => {
    const query = window.matchMedia(WIDE_QUERY);
    const update = () => setWide(query.matches);
    update();
    query.addEventListener("change", update);
    // 動きを減らす設定では指に付いて動かないので、裏で読み込まない。iframe の中（左右の画面や列の中）では作らない（入れ子にしない）。
    // 帯でその画面を開いたまま読み込み直したとき（?pane=）は、すぐ読み込む
    const nested = window.self !== window.top;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = nested || (still && !shown) ? 0 : window.setTimeout(() => setPane(true), shown ? 0 : PANE_DELAY_MS);
    return () => {
      query.removeEventListener("change", update);
      window.clearTimeout(timer);
    };
  }, []);
  useEffect(() => {
    const onRequest = (event: Event) => {
      const { side: target, href } = (event as CustomEvent<ColumnRequest>).detail;
      if (target === side) setCurrent((previous) => ({ href, turn: previous.turn + 1 }));
    };
    window.addEventListener(COLUMN_EVENT, onRequest);
    return () => window.removeEventListener(COLUMN_EVENT, onRequest);
  }, [side]);
  return (
    // 0-2z：止まっている帯で見えていない左右の画面には触れない（inert。帯が動くと strip.ts が付け替える）
    <div className="wide-panel" data-side={side} data-mode={wide ? "column" : "pane"} inert={!wide && !shown ? true : undefined}>
      {(wide || pane) && (
        <iframe
          key={`${current.turn}:${current.href}`}
          src={current.href}
          title={title}
          data-side={side}
          data-mode={wide ? "column" : "pane"}
          // 読み込みが済んだ印。帯の準備（strip.ts の stripReady）が見る
          onLoad={(event) => {
            event.currentTarget.dataset.loaded = "true";
            // 0-3h：「これまで」を広げたまま中が読み直されたら、列の大きさに戻す
            collapseColumn(event.currentTarget);
          }}
          tabIndex={wide ? undefined : -1}
          aria-hidden={wide ? undefined : true}
        />
      )}
    </div>
  );
}

/**
 * 欄の印と、広い画面での行き先の見張り（0-2y）。
 * - 欄の中では html に data-embed を付ける（<head> のスクリプトでも描く前に付けている）
 * - 広い画面の外側で奥の画面へ移ったら、ホームの3列の、その列の中へ移す（画面は CSS で隠れていて、1列では見えない）
 * - 欄の中のリンクが話す画面へ向かうときは外側ごと、もう片方の列の画面へ向かうときはその列で開く
 */
export function EmbedMark() {
  const pathname = usePathname();

  // 欄の印は、列（column）のときだけ。裏で読み込んだ左右の画面（pane）は単独と同じ見た目にする。
  // iPad を回したときは、同じ iframe が列と左右の画面の間で替わるので、iframe の印を見張って付け替える
  useEffect(() => {
    if (window.self === window.top) return;
    const frame = window.frameElement as HTMLElement | null;
    const root = document.documentElement;
    const apply = () => {
      if (frame?.dataset.mode === "pane") {
        delete root.dataset.embed;
        root.dataset.pane = "true";
      } else {
        root.dataset.embed = "true";
        delete root.dataset.pane;
      }
    };
    apply();
    if (!frame) return;
    const watch = new MutationObserver(apply);
    watch.observe(frame, { attributes: true, attributeFilter: ["data-mode"] });
    return () => watch.disconnect();
  }, []);

  useEffect(() => {
    if (window.self !== window.top) return;
    const check = () => {
      if (!isWide() || wideSide(location.pathname) === null) return;
      document.documentElement.dataset.wideAway = "true";
      location.replace(wideHomeUrl(location.pathname + location.search + location.hash));
    };
    check();
    const query = window.matchMedia(WIDE_QUERY);
    query.addEventListener("change", check);
    return () => query.removeEventListener("change", check);
  }, [pathname]);

  // 広い画面の外側（話す画面）のリンクが列の画面へ向かうときは、外側ごと移らず、その列の中で開く
  useEffect(() => {
    if (window.self !== window.top) return;
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[href]");
      if (!link || link.target || link.hasAttribute("download")) return;
      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin) return;
      const href = url.pathname + url.search + url.hash;
      if (!openInColumn(href) && !strip.go(href)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    if (window.self === window.top) return;
    const own = (window.frameElement as HTMLElement | null)?.dataset.side as WideSide | undefined;
    if (!own) return;
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[href]");
      if (!link || link.target || link.hasAttribute("download")) return;
      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin) return;
      const href = url.pathname + url.search + url.hash;
      const side = wideSide(url.pathname);
      // 0-2z：狭い画面の左右の画面（pane）では、3つの画面の入口へのリンク（下の印など）は外側の帯を動かす
      if (document.documentElement.dataset.pane === "true") {
        if (window.parent.koekataStrip?.go(href)) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (side === own) return;
        event.preventDefault();
        event.stopPropagation();
        window.top?.location.assign(href);
        return;
      }
      if (side === own) return;
      event.preventDefault();
      event.stopPropagation();
      const top = window.top;
      if (!top) return;
      if (side === null) top.location.assign(href);
      else if (isColumnPath(href)) top.dispatchEvent(new (top as typeof window).CustomEvent<ColumnRequest>(COLUMN_EVENT, { detail: { side, href } }));
    };
    // Next の Link より先に受ける
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
