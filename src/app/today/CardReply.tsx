"use client";

import { useState } from "react";
import { VoiceReply, type VoiceReplyRestore } from "../VoiceReply";

/** 今日のカードや担任への案内から、話して返信する。押すまで開かない。 */
export function CardReply({ postId, label = "話して返信する", onSent }: { postId: string; label?: string; onSent?(): void }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  // 0-2l：押した瞬間に届けた形にし、届かなかったら言葉を戻して知らせる
  const [retry, setRetry] = useState<{ key: number; value: VoiceReplyRestore; message: string } | null>(null);

  if (sent) {
    return (
      <p className="seen-note" role="status">
        返信を届けました。
      </p>
    );
  }
  if (!open) {
    return (
      <button type="button" className="secondary card-reply-open" onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  }
  return (
    <div className="talk card-reply" aria-label="話して返信する" role="group">
      <VoiceReply
        key={retry?.key ?? 0}
        postId={postId}
        draftUrl="/api/today/reply/draft"
        replyUrl="/api/today/reply"
        listenLabel="声で話す"
        restore={retry?.value}
        onSent={() => {
          setSent(true);
          onSent?.();
        }}
        onFailed={(value, message) => {
          setRetry((current) => ({ key: (current?.key ?? 0) + 1, value, message }));
          setSent(false);
        }}
      />
      {retry && (
        <p className="notice" role="alert">
          {retry.message}
        </p>
      )}
    </div>
  );
}
