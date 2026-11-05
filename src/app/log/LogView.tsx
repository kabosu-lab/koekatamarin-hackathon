"use client";

import { useEffect, useState } from "react";
import type { ChatMessage } from "@/lib/claude/types";
import { loadTalk } from "../talk-storage";

/** 今のタブの中の、パートナーとの話。サーバーには残していないので、タブを閉じると消える。 */
export function LogView({ viewerName }: { viewerName: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => setMessages(loadTalk(viewerName)), [viewerName]);

  if (messages.length === 0) return <p>まだ話していません。話すと、ここで読み返せます。</p>;
  return (
    <ol className="retro-log-list">
      {messages.map((message, index) => (
        <li key={index} data-role={message.role}>
          <strong>{message.role === "user" ? "あなた" : "パートナー"}</strong>
          <p>{message.content}</p>
        </li>
      ))}
    </ol>
  );
}
