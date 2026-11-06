"use client";

import { type PointerEvent, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { BottomSheet } from "./BottomSheet";
import { Icon } from "./Icon";
import { isSpeechSupported, type ListeningSession, startSession } from "./speech";
import "./feedback-sheet.css";

const KINDS = ["分かりにくい", "動かない", "こうしたい", "よかった"];
const DRAFT_KEY = "koekata_feedback_draft";
/** 最初の注意カードを閉じたとき、浮かぶアイコンを弾ませて場所を教える（TrialNotice が送る） */
export const FEEDBACK_HINT_EVENT = "koekata:feedback-hint";
/** 話す画面から感想を届けたとき、アイコンの横に「ありがとう」を出す */
const FEEDBACK_SENT_EVENT = "koekata:feedback-sent";

type FeedbackPayload = { kind?: string; body: string; from?: "talk" };

/** 感想を送る。名前も人物も送らない。送れたら true、連打で止められたら "busy" */
export async function postFeedback(payload: FeedbackPayload, path: string): Promise<true | "busy" | false> {
  try {
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, path, screenWidth: window.innerWidth }),
    });
    if (response.status === 429) return "busy";
    if (!response.ok) return false;
    if (payload.from === "talk") window.dispatchEvent(new Event(FEEDBACK_SENT_EVENT));
    return true;
  } catch {
    return false;
  }
}

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

/** 感想のアイコンの絵。浮かぶボタンと、注意カードの文の中で同じ絵を使う */
export function FeedbackGlyph() {
  return <Icon name="chat" />;
}

/**
 * 試用中の感想の入口（0-2h）。どの画面でも右上に小さく浮かび、押すと下からシートが出る。
 * 押し続けて声でも、打っても送れる。種類は選ばなくてよい。誰が送ったかは送らない。
 */
export function FeedbackSheet() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [thanks, setThanks] = useState(false);
  const [bounce, setBounce] = useState(0);
  const [voice, setVoice] = useState(false);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const session = useRef<ListeningSession | null>(null);
  const latest = useRef({ kind: "", body: "" });
  latest.current = { kind, body };

  useEffect(() => {
    // サーバーの描画と食い違わないよう、開いたあとで書きかけを戻す
    const draft = readDraft();
    setKind(draft.kind);
    setBody(draft.body);
    setVoice(isSpeechSupported());
    const hint = () => setBounce((n) => n + 1);
    const sent = () => setThanks(true);
    window.addEventListener(FEEDBACK_HINT_EVENT, hint);
    window.addEventListener(FEEDBACK_SENT_EVENT, sent);
    return () => {
      window.removeEventListener(FEEDBACK_HINT_EVENT, hint);
      window.removeEventListener(FEEDBACK_SENT_EVENT, sent);
      session.current?.stop();
    };
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

  function close() {
    session.current?.stop();
    setOpen(false);
  }

  function startVoice(event: PointerEvent<HTMLButtonElement>) {
    if (session.current || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setProblem("");
    setHeard("");
    try {
      session.current = startSession({
        onInterim: setHeard,
        onFinal: (text) => {
          const words = text.trim();
          if (!words) return;
          const { kind: k, body: b } = latest.current;
          update(k, b ? `${b}\n${words}` : words);
        },
        onError: setProblem,
        onEnd: () => {
          session.current = null;
          setListening(false);
          setHeard("");
        },
      });
      setListening(true);
    } catch {
      session.current = null;
      setProblem("声が使えません。文字で書いてください。");
    }
  }

  function stopVoice() {
    session.current?.stop();
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if ((!kind && !body.trim()) || busy) return;
    session.current?.stop();
    // 0-2l(2)：押した瞬間に閉じて「ありがとう」を出し、送信は裏で進める。失敗したときだけ、書いた内容を戻して開き直す
    const sent = { kind, body };
    setBusy(true);
    setProblem("");
    update("", "");
    setThanks(true);
    setOpen(false);
    const result = await postFeedback({ kind: sent.kind || undefined, body: sent.body }, pathname);
    setBusy(false);
    if (result === true) return;
    update(sent.kind, sent.body);
    setThanks(false);
    setProblem(
      result === "busy"
        ? "少し待ってから送ってください。書いた内容は残っています。"
        : "送れませんでした。書いた内容は残っています。もう一度押してください。",
    );
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        key={bounce}
        className="feedback-fab"
        data-bounce={bounce > 0 ? "true" : undefined}
        aria-label="感想を送る"
        title="感想を送る"
        onClick={() => setOpen(true)}
      >
        <FeedbackGlyph />
      </button>
      {thanks && (
        <span className="feedback-thanks" role="status">
          ありがとう
        </span>
      )}
      <BottomSheet
        open={open}
        onClose={close}
        label="感想を送る"
        footer={
          <div className="feedback-actions">
            <button type="button" onClick={close}>
              閉じる
            </button>
            <button type="submit" form="feedback-form" disabled={(!kind && !body.trim()) || busy}>
              {busy ? "送っています…" : "送る"}
            </button>
          </div>
        }
      >
        <form id="feedback-form" className="feedback-form" onSubmit={(event) => void send(event)}>
          <h2>感想を送る</h2>
          <p>名前は書かないでください。ここは相談先ではありません。困っていることは先生に直接話してください。</p>
          {voice && (
            <button
              type="button"
              className="feedback-mic"
              data-listening={listening ? "true" : undefined}
              onPointerDown={startVoice}
              onPointerUp={stopVoice}
              onPointerCancel={stopVoice}
              onContextMenu={(event) => event.preventDefault()}
            >
              <Icon name="talk" />
              {listening ? "離すと文字になる" : "押しながら話す"}
            </button>
          )}
          {heard && <p className="feedback-heard">{heard}</p>}
          <label className="feedback-body">
            くわしく{voice ? "（話しても、打ってもいい）" : ""}
            <textarea value={body} maxLength={1000} rows={3} onChange={(event) => update(kind, event.target.value)} />
          </label>
          <fieldset>
            <legend>どんなこと？（選ばなくても送れます）</legend>
            {KINDS.map((name) => (
              <label key={name} className={kind === name ? "chosen" : undefined}>
                <input
                  type="radio"
                  name="feedback-kind"
                  checked={kind === name}
                  onChange={() => update(name, body)}
                  // もう一度押すと外せる（選ばなくても送れる）
                  onClick={() => kind === name && update("", body)}
                />
                {name}
              </label>
            ))}
          </fieldset>
          {problem && <p role="alert">{problem}</p>}
        </form>
      </BottomSheet>
    </>
  );
}
