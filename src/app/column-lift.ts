"use client";

import { useEffect, useState } from "react";
import { WIDE_QUERY } from "@/lib/wide";

/**
 * 0-3m（0-3h の「これまで」を一般にしたもの）：横向きの3列（iPad 横・パソコン）では、シートや重ねの画面は
 * 列の中ではなく、3列の上に全画面でせり上がる。仕組みはここ1か所。
 *
 * - 外側（話す画面）で開くとき：シートは最上層（<dialog> の showModal）に出し、左右の列には inert を付ける。
 * - 列の iframe の中で開くとき：開いている間だけ、その iframe を外側の画面いっぱいに広げ（data-column-full と retro.css）、
 *   中の画面は重ね（data-lift-layer）のほかを隠して透明にする（後ろに3列が見え、重ねの暗幕で暗くなる）。
 *   裏に隠れた列（真ん中の話す画面ともう片方の列）には inert を付ける。閉じると元の3列に戻す。
 * iPhone・iPad 縦（3列でないとき）は、何もしない。
 */

const INERT_MARK = "liftInert";

/** この画面を入れている列の iframe（3列のときだけ）。外側や、狭い画面の左右の画面（pane）では null */
function columnFrame(): HTMLElement | null {
  try {
    if (window.self === window.top) return null;
    const frame = window.frameElement as HTMLElement | null;
    return frame?.dataset.mode === "column" ? frame : null;
  } catch {
    // 別オリジンの枠の中では、広げない
    return null;
  }
}

/** 今、シートを3列の上に上げるか（外側で3列のとき、または3列の列の中のとき） */
function shouldLift(): boolean {
  if (typeof window === "undefined") return false;
  if (window.self === window.top) return window.matchMedia?.(WIDE_QUERY).matches === true;
  return columnFrame() !== null;
}

/** シートを3列の上に上げるか。画面の向きや列の形が変わったら追い直す */
export function useLiftMode(): boolean {
  const [lift, setLift] = useState(false);
  useEffect(() => {
    const update = () => setLift(shouldLift());
    update();
    const query = window.matchMedia?.(WIDE_QUERY);
    query?.addEventListener("change", update);
    let watch: MutationObserver | null = null;
    try {
      const frame = window.self !== window.top ? (window.frameElement as HTMLElement | null) : null;
      if (frame) {
        watch = new MutationObserver(update);
        watch.observe(frame, { attributes: true, attributeFilter: ["data-mode"] });
      }
    } catch {
      watch = null;
    }
    return () => {
      query?.removeEventListener("change", update);
      watch?.disconnect();
    };
  }, []);
  return lift;
}

function setInert(elements: Iterable<HTMLElement>) {
  for (const element of elements) {
    if (element.inert) continue;
    element.inert = true;
    element.dataset[INERT_MARK] = "true";
  }
}

function clearInert(root: ParentNode | null | undefined) {
  root?.querySelectorAll<HTMLElement>("[data-lift-inert]").forEach((element) => {
    element.inert = false;
    delete element.dataset[INERT_MARK];
  });
}

/** 列の iframe を外側いっぱいに広げる。いくつ重なっても、最後の1つが閉じるまで広げたまま */
export function expandColumn(frame: HTMLElement) {
  const count = Number(frame.dataset.liftCount ?? 0) + 1;
  frame.dataset.liftCount = String(count);
  if (count > 1) return;
  frame.dataset.columnFull = "true";
  const row = frame.closest(".device-row");
  if (!row) return;
  setInert(
    [...row.querySelectorAll<HTMLElement>(":scope > .retro-home, :scope > .wide-panel")].filter((element) => !element.contains(frame)),
  );
}

/** 列の大きさに戻す。all のときは数を数えずに戻す（列の中が読み直されたとき） */
export function collapseColumn(frame: HTMLElement, all = false) {
  const count = all ? 0 : Math.max(0, Number(frame.dataset.liftCount ?? 0) - 1);
  if (count > 0) {
    frame.dataset.liftCount = String(count);
    return;
  }
  delete frame.dataset.liftCount;
  if (frame.dataset.columnFull !== "true") return;
  delete frame.dataset.columnFull;
  clearInert(frame.closest(".device-row"));
}

let innerCount = 0;

/**
 * 重ねが出ている間（active）、3列なら3列の上に上げる。外側では左右の列を inert に、列の中では iframe を広げる。
 * 重ねの外側の要素には data-lift-layer を付けておく（列の中で、重ねのほかの画面を隠すため）。
 */
export function useLift(active: boolean) {
  useEffect(() => {
    if (!active || !shouldLift()) return;
    const frame = columnFrame();
    if (!frame) {
      // 外側：左右の列を inert に（真ん中は、シートの <dialog> が最上層で受ける）
      const row = document.querySelector(".device-row");
      const sides = row ? [...row.querySelectorAll<HTMLElement>(":scope > .wide-panel")].filter((side) => !side.inert) : [];
      setInert(sides);
      return () => {
        for (const side of sides) {
          if (side.dataset[INERT_MARK] !== "true") continue;
          side.inert = false;
          delete side.dataset[INERT_MARK];
        }
      };
    }
    innerCount += 1;
    document.documentElement.dataset.columnLift = "true";
    expandColumn(frame);
    return () => {
      innerCount = Math.max(0, innerCount - 1);
      if (innerCount === 0) delete document.documentElement.dataset.columnLift;
      collapseColumn(frame);
    };
  }, [active]);
}
