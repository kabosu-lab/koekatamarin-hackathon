"use client";

import { useEffect, useState } from "react";
import type { ChatMessage } from "@/lib/claude/types";
import { loadTalk } from "../talk-storage";

/** 今のタブの中の、パートナーとの話。サーバーには残していないので、タブを閉じると消える。 */
export function LogView({ viewerName }: { viewerName: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    // 広い画面では話す画面の横に並ぶので、話すたびに読み直す（同じタブの中の保存が変わると知らせが来る）
    const reload = () => setMessages(loadTalk(viewerName));
    reload();
    window.addEventListener("storage", reload);
    window.addEventListener("focus", reload);
    const timer = window.setInterval(reload, 3000);
    return () => {
      window.removeEventListener("storage", reload);
      window.removeEventListener("focus", reload);
      window.clearInterval(timer);
    };
  }, [viewerName]);

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
