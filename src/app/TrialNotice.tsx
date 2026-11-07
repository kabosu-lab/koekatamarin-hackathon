"use client";

import { useEffect, useState } from "react";
import { FEEDBACK_ICON_SLOT } from "@/lib/trial";
import { FEEDBACK_HINT_EVENT, FeedbackGlyph } from "./FeedbackSheet";
import { audioOutput } from "./sound";

const SEEN_KEY = "koekata_trial_notice_seen";
const OPEN_EVENT = "koekata:trial-notice";

/**
 * 試用版の注意。操作画面に入る前に、手前に重ねたカードで1回だけ出し、タップで消す。
 * 消したあとは試用の印を何も出さない（製品版と同じ画面）。読み直しは「履歴と設定」から（TrialTools）。
 * 感想を集めているときは、右上の感想のアイコンを文の中に小さく描いて誘い、閉じた直後にそのアイコンを弾ませる（0-2h (4b)）。
 */
export function TrialNotice({ text, feedbackHint = null }: { text: string; feedbackHint?: string | null }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // 列や左右の画面（iframe）の中には出さない。外側に1回だけ
    if (window.self !== window.top) return;
    try {
      if (localStorage.getItem(SEEN_KEY) !== "1") setOpen(true);
    } catch {
      setOpen(true);
    }
    const reopen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, reopen);
    return () => window.removeEventListener(OPEN_EVENT, reopen);
  }, []);

  function close() {
    // iOS は最初のタップまで音を出せない。このタップで音の準備をする（0-1v）
    audioOutput();
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // 残せなくても閉じられる。次に開いたときにもう一度出る
    }
    setOpen(false);
    if (feedbackHint) window.dispatchEvent(new Event(FEEDBACK_HINT_EVENT));
  }

  if (!open) return null;
  return (
    <div className="first-card-backdrop" onClick={close}>
      <section className="first-card" role="dialog" aria-modal="true" aria-label="試用版について" onKeyDown={(event) => event.key === "Escape" && close()}>
        <p role="note">{text}</p>
        {feedbackHint && <FeedbackHint text={feedbackHint} />}
        <button type="button" autoFocus onClick={close}>
          わかった
        </button>
      </section>
    </div>
  );
}

/** 感想の誘い。文の中の印の場所に、浮かぶアイコンと同じ絵を小さく描く */
function FeedbackHint({ text }: { text: string }) {
  const [before, after = ""] = text.split(FEEDBACK_ICON_SLOT);
  return (
    <p className="first-card-feedback">
      {before}
      <span className="feedback-glyph-inline" role="img" aria-label="感想のアイコン">
        <FeedbackGlyph />
      </span>
      {after}
    </p>
  );
}

/**
 * 「履歴と設定」に置く、試用版の注意の読み直し。
 * 感想の入口は右上に浮かぶアイコン（FeedbackSheet）だけにする（同じ入口を2か所に置かない）。
 */
export function TrialTools() {
  return (
    <section className="card trial-tools" aria-label="試用版について">
      <h2>試用版</h2>
      <div className="row">
        <button
          type="button"
          onClick={() => {
            // 列や左右の画面（iframe）の中から押したときは、外側の話す画面へ帯を戻してから、外側で注意を出す
            const top = (window.top ?? window) as Window & typeof globalThis;
            top.koekataStrip?.go("/");
            top.dispatchEvent(new top.Event(OPEN_EVENT));
          }}
        >
          注意を読み直す
        </button>
      </div>
    </section>
  );
}
