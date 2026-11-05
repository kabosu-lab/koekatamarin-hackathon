"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const KINDS = ["分かりにくい", "動かない", "こうしたい", "よかった"];
const DRAFT_KEY = "koekata_feedback_draft";

function readDraft(): { kind: string; body: string } {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? "{}") as { kind?: unknown; body?: unknown };
    return { kind: typeof parsed.kind === "string" ? parsed.kind : "", body: typeof parsed.body === "string" ? parsed.body : "" };
  } catch {
    return { kind: "", body: "" };
  }
}

function writeDraft(kind: string, body: string) {
  try {
    if (kind || body) sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ kind, body }));
    else sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // 残せなくても送れる
  }
}

/** 試用のときだけ出す、改善点の入口とシート。誰が送ったかは送らない。 */
export function FeedbackSheet() {
  const dialog = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const [kind, setKind] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [thanks, setThanks] = useState(false);

  useEffect(() => {
    // サーバーの描画と食い違わないよう、開いたあとで書きかけを戻す
    const draft = readDraft();
    setKind(draft.kind);
    setBody(draft.body);
  }, []);

  useEffect(() => {
    if (!thanks) return;
    const timer = setTimeout(() => setThanks(false), 4000);
    return () => clearTimeout(timer);
  }, [thanks]);

  function update(nextKind: string, nextBody: string) {
    setKind(nextKind);
    setBody(nextBody);
    writeDraft(nextKind, nextBody);
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!kind || busy) return;
    setBusy(true);
    setProblem("");
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, body, path: pathname, screenWidth: window.innerWidth }),
      });
      if (response.status === 429) {
        setProblem("少し待ってから送ってください。書いた内容は残っています。");
        return;
      }
      if (!response.ok) throw new Error(`status ${response.status}`);
      update("", "");
      setThanks(true);
      dialog.current?.close();
    } catch {
      setProblem("送れませんでした。書いた内容は残っています。もう一度押してください。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="feedback-open" onClick={() => dialog.current?.showModal()}>
        感想を送る
      </button>
      {thanks && (
        <span className="feedback-thanks" role="status">
          ありがとう
        </span>
      )}
      <dialog ref={dialog} className="feedback-sheet" aria-label="感想を送る">
        <form onSubmit={(event) => void send(event)}>
          <h2>感想を送る</h2>
          <p>名前は書かないでください。ここは相談先ではありません。困っていることは先生に直接話してください。</p>
          <fieldset>
            <legend>どんなことですか</legend>
            {KINDS.map((name) => (
              <label key={name} className={kind === name ? "chosen" : undefined}>
                <input type="radio" name="feedback-kind" checked={kind === name} onChange={() => update(name, body)} />
                {name}
              </label>
            ))}
          </fieldset>
          <label className="feedback-body">
            くわしく（書かなくても送れます）
            <textarea value={body} maxLength={1000} rows={4} onChange={(event) => update(kind, event.target.value)} />
          </label>
          {problem && <p role="alert">{problem}</p>}
          <div className="feedback-actions">
            <button type="button" onClick={() => dialog.current?.close()}>
              閉じる
            </button>
            <button type="submit" disabled={!kind || busy}>
              {busy ? "送っています…" : "送る"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
