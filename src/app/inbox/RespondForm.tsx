"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RespondForm({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function send() {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "respond", reportId, text }),
      });
      if (response.ok) {
        setText("");
        router.refresh();
        return;
      }
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      setNotice(data.error ?? "まだ送っていません。もう一度押してください。");
    } catch {
      setNotice("まだ送っていません。もう一度押してください。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <label>
        一言かえす
        <textarea rows={2} maxLength={2000} value={text} onChange={(event) => setText(event.target.value)} />
      </label>
      <button type="button" disabled={busy || text.trim() === ""} onClick={() => void send()}>
        一言を送る
      </button>
      {notice && (
        <p className="notice" role="alert">
          {notice}
        </p>
      )}
    </>
  );
}
