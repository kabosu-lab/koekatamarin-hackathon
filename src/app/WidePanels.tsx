"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { isColumnPath, WIDE_QUERY, type WideSide, wideHomeUrl, wideSide } from "@/lib/wide";

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
  if (!openInColumn(href)) push(href);
}

/**
 * 広い画面では、話す画面の左右に同じ画面を並べる。欄の中のリンクは欄の中で動き、真ん中の機器は保たれる。
 * 列の枠はサーバーで描き、出すかどうかは CSS のメディアクエリで決める（0-2y。最初の描画から3列）。
 * 中の iframe は広い画面のときだけ読み込む（スマホでは余分に読まない）。
 */
export function WidePanel({ src, title, side }: { src: string; title: string; side: WideSide }) {
  const [wide, setWide] = useState(false);
  // 同じ画面をもう一度開いたときも、列の中を開き直す（奥の状態から戻す）
  const [current, setCurrent] = useState({ href: src, turn: 0 });
  useEffect(() => {
    const query = window.matchMedia(WIDE_QUERY);
    const update = () => setWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
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
    <div className="wide-panel" data-side={side}>
      {wide && <iframe key={`${current.turn}:${current.href}`} src={current.href} title={title} data-side={side} />}
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

  useEffect(() => {
    if (window.self !== window.top) document.documentElement.dataset.embed = "true";
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
      if (!openInColumn(url.pathname + url.search + url.hash)) return;
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
