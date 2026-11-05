"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ReplyNotice } from "@/lib/reply-notices";

const SHOW_MS = 8_000;

/**
 * 届いた返事を、窓の上に短く知らせる。アプリを開いているときだけで、スマホの通知は作らない。
 * 話している間は出さず、終わってから出す。消えたあとも受信箱で読める。
 */
export function ReplyToast({ initial, paused, pollMs }: { initial: ReplyNotice[]; paused: boolean; pollMs: number }) {
  const [waiting, setWaiting] = useState(initial);
  const [shown, setShown] = useState<ReplyNotice[]>([]);
  const seen = useRef(new Set<string>());

  useEffect(() => {
    const poll = async () => {
      if (document.hidden) return;
      const response = await fetch("/api/notices").catch(() => null);
      if (!response?.ok) return;
      const { notices } = (await response.json()) as { notices: ReplyNotice[] };
      setWaiting((current) => {
        const known = new Set([...current.map((notice) => notice.replyId), ...seen.current]);
        return [...notices.filter((notice) => !known.has(notice.replyId)), ...current];
      });
    };
    const timer = setInterval(() => void poll(), pollMs);
    return () => clearInterval(timer);
  }, [pollMs]);

  useEffect(() => {
    if (paused || shown.length > 0 || waiting.length === 0) return;
    for (const notice of waiting) seen.current.add(notice.replyId);
    setShown(waiting);
    setWaiting([]);
    void fetch("/api/notices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ replyIds: waiting.map((notice) => notice.replyId) }),
    }).catch(() => null);
  }, [paused, shown, waiting]);

  useEffect(() => {
    if (shown.length === 0) return;
    const timer = setTimeout(() => setShown([]), SHOW_MS);
    return () => clearTimeout(timer);
  }, [shown]);

  const [latest, ...others] = shown;
  if (!latest || paused) return null;
  return (
    <Link className="reply-toast" href="/inbox#replies" role="status" aria-label="届いた返事">
      <strong>{latest.authorName}さんから返事が届きました</strong>
      <span className="reply-toast-body">「{latest.body}」</span>
      {others.length > 0 && <small>ほか{others.length}件</small>}
    </Link>
  );
}
