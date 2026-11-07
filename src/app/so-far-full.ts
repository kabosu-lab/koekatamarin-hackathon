/**
 * 0-3h：横向きの3列で「これまで」を開いている間だけ、左の列の iframe を外側の画面いっぱいに広げる。
 * 広げ方は iframe の data-so-far-full と retro.css の「0-3h」の節だけで描く（インラインの style は書かない）。
 * 広げている間、裏に隠れた列（真ん中の話す画面ともう片方の列）には inert を付け、Tab や読み上げが裏へ抜けないようにする。
 */

const MARK = "soFarInert";

export function expandColumn(frame: HTMLElement) {
  frame.dataset.soFarFull = "true";
  const row = frame.closest(".device-row");
  row?.querySelectorAll<HTMLElement>(":scope > .retro-home, :scope > .wide-panel").forEach((element) => {
    if (element.contains(frame) || element.inert) return;
    element.inert = true;
    element.dataset[MARK] = "true";
  });
}

/** 列の大きさに戻す。ここで付けた inert だけを外す（帯の inert には触れない） */
export function collapseColumn(frame: HTMLElement) {
  if (frame.dataset.soFarFull !== "true") return;
  delete frame.dataset.soFarFull;
  frame
    .closest(".device-row")
    ?.querySelectorAll<HTMLElement>("[data-so-far-inert]")
    .forEach((element) => {
      element.inert = false;
      delete element.dataset[MARK];
    });
}
