"use client";

import { useState } from "react";
import { VoiceReply } from "../VoiceReply";

/** 今日のカードや担任への案内から、話して返信する。押すまで開かない。 */
export function CardReply({ postId, label = "話して返信する" }: { postId: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);

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
      <VoiceReply postId={postId} draftUrl="/api/today/reply/draft" replyUrl="/api/today/reply" listenLabel="声で話す" onSent={() => setSent(true)} />
    </div>
  );
}
