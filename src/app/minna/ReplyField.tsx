"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useLift } from "../column-lift";
import { LEAF_EVENT } from "@/lib/sakura";
import { createReply, toggleLike } from "../teams/actions";
import { playCommitRun } from "../sound";
import { isSpeechSupported, startListening } from "../speech";

/** 欄が下がって消える時間（設計書 §2-2-5：160ms ease-in） */
const CLOSE_MS = 160;

/** 人に届いて葉が1枚増えたことを、桜に知らせる */
function leafReached() {
  window.dispatchEvent(new CustomEvent(LEAF_EVENT, { detail: { count: 1 } }));
}

/**
 * カードの下の、いいね・返事の数・返信。返信は下からせり上がる欄で、打つか話して返す（0-1k(5)）。
 * 新しい投稿の欄は置かない（新しい投稿は「話す」画面からパートナーと作る）。
 */
export function ReplyField({
  postId,
  authorName,
  own,
  likeCount,
  liked,
  replyCount,
  onAnswered,
}: {
  postId: string;
  authorName: string;
  /** 自分の投稿には、いいねを押せない */
  own: boolean;
  likeCount: number;
  liked: boolean;
  replyCount: number;
  /** 0-3p：今日の3人で、返信が届いたとき（カードを消す合図）。いいねは押しただけでは消さない（払えば消える） */
  onAnswered?(): void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [likeState, setLikeState] = useState({ liked, count: likeCount });
  const [extraReplies, setExtraReplies] = useState(0);
  const [bump, setBump] = useState(0);
  const [sheet, setSheet] = useState<"closed" | "open" | "closing">("closed");
  // 0-3m：3列のときは、3列の上に全画面で（column-lift.ts）
  useLift(sheet !== "closed");
  const [text, setText] = useState("");
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const stopListening = useRef<(() => void) | null>(null);
  /** 0-2m：この欄で話した回数。話している間は鳴らさず、話し終えたときに鈴をまとめて鳴らす */
  const spoken = useRef(0);
  const field = useRef<HTMLTextAreaElement>(null);
  const opener = useRef<HTMLButtonElement>(null);

  // 読み直しで本当の数が来たら、先に足していた分を戻す
  useEffect(() => setLikeState({ liked, count: likeCount }), [liked, likeCount]);
  useEffect(() => setExtraReplies(0), [replyCount]);

  useEffect(() => {
    if (sheet === "open") field.current?.focus();
  }, [sheet]);

  useEffect(() => () => stopListening.current?.(), []);

  const close = () => {
    stopListening.current?.();
    setSheet("closing");
    window.setTimeout(() => {
      setSheet("closed");
      opener.current?.focus();
    }, CLOSE_MS);
  };

  useEffect(() => {
    if (sheet !== "open") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const like = () => {
    // 押した瞬間に押した形にする（原則4）
    const next = !likeState.liked;
    setLikeState({ liked: next, count: likeState.count + (next ? 1 : -1) });
    if (next) leafReached();
    const form = new FormData();
    form.set("postId", postId);
    startTransition(async () => {
      await toggleLike(form);
      router.refresh();
    });
  };

  const listen = () => {
    if (listening) {
      stopListening.current?.();
      return;
    }
    setError("");
    try {
      stopListening.current = startListening({
        onInterim: setInterim,
        onFinal: (words) => {
          setInterim("");
          setText((before) => `${before}${words}`);
          // 聞き取りは話し終えてから1回だけ言葉を渡すので、ここで鈴をまとめて鳴らす
          spoken.current += 1;
          playCommitRun(spoken.current);
        },
        onError: setError,
        onEnd: () => {
          setListening(false);
          setInterim("");
          stopListening.current = null;
        },
      });
      setListening(true);
    } catch {
      setError("このブラウザでは声で返せません。文字で書いてください。");
    }
  };

  const send = (event: FormEvent) => {
    event.preventDefault();
    const body = text.trim();
    if (!body) return;
    const form = new FormData();
    form.set("postId", postId);
    form.set("body", body);
    // 送ると欄は閉じ、返事の数が1つ増える。届いた返事は人に届くので、葉も1枚。鈴の段は最初に戻す
    spoken.current = 0;
    setText("");
    close();
    setExtraReplies((n) => n + 1);
    setBump((n) => n + 1);
    leafReached();
    startTransition(async () => {
      try {
        await createReply(form);
        onAnswered?.();
        router.refresh();
      } catch {
        setExtraReplies((n) => Math.max(0, n - 1));
        setText(body);
        setError("返信を送れませんでした。もう一度押してください。");
        setSheet("open");
      }
    });
  };

  const replies = replyCount + extraReplies;

  return (
    <div className="minna-post-actions">
      {own ? (
        <span className="minna-post-likes">いいね {likeState.count}</span>
      ) : (
        <button type="button" className="minna-post-like" aria-pressed={likeState.liked} onClick={like}>
          いいね {likeState.count}
        </button>
      )}
      <span className="minna-post-count" key={bump} data-bump={bump > 0 ? "true" : undefined}>
        返事 {replies}
      </span>
      <button
        ref={opener}
        type="button"
        className="minna-post-reply"
        aria-haspopup="dialog"
        aria-expanded={sheet === "open"}
        onClick={() => {
          setError("");
          setSheet("open");
        }}
      >
        返信
      </button>
      {sheet !== "closed" &&
        createPortal(
          <div className="minna-reply-layer" data-state={sheet} data-lift-layer>
            <div className="minna-reply-scrim" aria-hidden="true" onClick={close} />
            <form className="minna-reply-sheet" role="dialog" aria-label={`${authorName}さんへの返信`} onSubmit={send} data-noswipe>
              <span className="minna-reply-handle" aria-hidden="true" />
              <label className="minna-reply-label" htmlFor={`reply-${postId}`}>
                {authorName}さんへ返信
              </label>
              <textarea
                id={`reply-${postId}`}
                ref={field}
                aria-label="返信"
                rows={2}
                maxLength={2000}
                value={listening && interim ? `${text}${interim}` : text}
                onChange={(event) => setText(event.target.value)}
                placeholder="打つか、マイクを押して話す"
              />
              {error && (
                <p className="minna-reply-error" role="alert">
                  {error}
                </p>
              )}
              <div className="minna-reply-buttons">
                <button type="button" className="minna-reply-cancel" onClick={close}>
                  やめる
                </button>
                {isSpeechSupported() && (
                  <button type="button" className="minna-reply-mic" aria-pressed={listening} onClick={listen}>
                    {listening ? "止める" : "話す"}
                  </button>
                )}
                <button type="submit" className="minna-reply-send" disabled={!text.trim()}>
                  返信する
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )}
    </div>
  );
}
