"use client";

import { useEffect, useState } from "react";
import type { ChatMessage } from "@/lib/claude/types";
import { loadArchive, loadTalk } from "../talk-storage";

/** 今のタブの中の、パートナーとの話。サーバーには残していないので、タブを閉じると消える。 */
export function LogView({ viewerName }: { viewerName: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [past, setPast] = useState<ChatMessage[][]>([]);

  useEffect(() => {
    // 広い画面では話す画面の横に並ぶので、話すたびに読み直す（同じタブの中の保存が変わると知らせが来る）
    const reload = () => {
      setMessages(loadTalk(viewerName));
      setPast(loadArchive(viewerName));
    };
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

  if (messages.length === 0 && past.length === 0) return <p>まだ話していません。話すと、ここで読み返せます。</p>;
  // 0-1q：話す画面の会話（0-1l）と同じ、LINE のような吹き出し。左にパートナー、右に自分。前の話も上に残る
  return (
    <div className="log-chat-all">
      {[...past, messages].filter((talk) => talk.length > 0).map((talk, talkIndex) => (
        <ol className="log-chat" key={talkIndex}>
          {talk.map((message, index) => (
            <li key={index} className={`log-chat-row ${message.role === "user" ? "me" : "partner"}`}>
              <p className="log-chat-bubble">
                <span className="visually-hidden">{message.role === "user" ? "あなた：" : "パートナー："}</span>
                {message.content}
              </p>
            </li>
          ))}
        </ol>
      ))}
    </div>
  );
}
