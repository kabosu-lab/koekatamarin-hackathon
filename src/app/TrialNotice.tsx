"use client";

import { useEffect, useState } from "react";
import { FeedbackSheet } from "./FeedbackSheet";
import { audioOutput } from "./sound";

const SEEN_KEY = "koekata_trial_notice_seen";
const OPEN_EVENT = "koekata:trial-notice";

/**
 * 試用版の注意。操作画面に入る前に、手前に重ねたカードで1回だけ出し、タップで消す。
 * 消したあとは試用の印を何も出さない（製品版と同じ画面）。読み直しと感想は「履歴と設定」から（TrialCorner）。
 */
export function TrialNotice({ text }: { text: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
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
  }

  if (!open) return null;
  return (
    <div className="first-card-backdrop" onClick={close}>
      <section className="first-card" role="dialog" aria-modal="true" aria-label="試用版について" onKeyDown={(event) => event.key === "Escape" && close()}>
        <p role="note">{text}</p>
        <button type="button" autoFocus onClick={close}>
          わかった
        </button>
      </section>
    </div>
  );
}

/** 「履歴と設定」に置く、試用版の注意の読み直しと感想の入口 */
export function TrialTools() {
  return (
    <section className="card trial-tools" aria-label="試用版について">
      <h2>試用版</h2>
      <div className="row">
        <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}>
          注意を読み直す
        </button>
        <FeedbackSheet />
      </div>
    </section>
  );
}
