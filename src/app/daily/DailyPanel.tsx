"use client";

import { useState } from "react";
import type { DailyReport, Recipient } from "@/lib/daily";
import { loadTalk } from "../talk-storage";

async function postDaily(body: unknown) {
  const response = await fetch("/api/daily", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ok: response.ok, data: (await response.json().catch(() => ({}))) as Record<string, unknown> };
}

type Props = {
  initialReport: DailyReport | null;
  recipients: Recipient[];
  viewerName: string;
  noun: string;
};

export function DailyPanel({ initialReport, recipients, viewerName, noun }: Props) {
  const [report, setReport] = useState(initialReport);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function make() {
    setBusy(true);
    setNotice("");
    try {
      // 相棒との話は、本人がこのボタンを押したときだけ材料として渡す
      const { ok, data } = await postDaily({ action: "make", conversation: loadTalk(viewerName).slice(-40) });
      if (!ok) {
        setNotice(typeof data.error === "string" ? data.error : "作れませんでした。もう一度押してください。");
        return;
      }
      const next = data.report as DailyReport | null;
      if (!next) setNotice("今日のやり取りがまだないみたい。話したり、投稿したりしたあとで作れます。");
      else setReport(next);
    } catch {
      setNotice("作れませんでした。もう一度押してください。");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(itemId: string, checked: boolean) {
    if (!report) return;
    setNotice("");
    const before = report;
    setReport({ ...report, items: report.items.map((i) => (i.id === itemId ? { ...i, checked } : i)) });
    const { ok } = await postDaily({ action: "check", itemId, checked }).catch(() => ({ ok: false }));
    if (!ok) {
      setReport(before);
      setNotice("変えられませんでした。もう一度押してください。");
    }
  }

  const to = recipients.map((r) => `${r.name}先生`).join("、");
  const canSend = recipients.length > 0;

  return (
    <>
      <section className="card" aria-label={`今日の${noun}`}>
        {report ? (
          <>
            <p className="muted">
              {canSend
                ? `チェックを付けた項目だけが、${to}に届きます。付けなければ誰にも届きません。`
                : "自分の記録です。誰にも届きません。"}
            </p>
            {report.items.map((item) => (
              <label className="daily-item" key={item.id}>
                {canSend && (
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={(event) => void toggle(item.id, event.target.checked)}
                  />
                )}
                <span>{item.text}</span>
              </label>
            ))}
          </>
        ) : (
          <p className="muted">今日のやり取りから、相棒が項目ごとにまとめます。</p>
        )}
        <button type="button" className={report ? "secondary" : undefined} disabled={busy} onClick={() => void make()}>
          {busy ? "まとめています…" : report ? "作り直す" : `今日の${noun}を作る`}
        </button>
        {notice && (
          <p className="notice" role="alert">
            {notice}
          </p>
        )}
      </section>

      {report && report.responses.length > 0 && (
        <section className="card" aria-label="届いた一言">
          <h2>届いた一言</h2>
          {report.responses.map((response) => (
            <p className="response-card" key={response.id}>
              <strong>{response.fromName}先生</strong>：{response.text}
            </p>
          ))}
        </section>
      )}
    </>
  );
}
