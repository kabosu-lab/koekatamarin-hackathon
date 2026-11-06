"use client";

import { useEffect, useRef, useState } from "react";
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

/**
 * 今日の日報・日記（0-1z）。開いたら、押さなくても増えた分だけまとまる。
 * 何もない日や、前から増えていない日は、サーバーが Claude を呼ばずに保存したものを返す。
 */
export function DailyPanel({ initialReport, recipients, viewerName, noun }: Props) {
  const [report, setReport] = useState(initialReport);
  const [syncing, setSyncing] = useState(true);
  const [slow, setSlow] = useState(false);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState("");
  // 届くかどうかに関わるので、1項目ずつ順に確定させる。応答が逆転して画面と記録がずれないように
  const [updating, setUpdating] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, string> | null>(null);
  const started = useRef(false);

  async function sync() {
    setSyncing(true);
    setFailed(false);
    const slowTimer = window.setTimeout(() => setSlow(true), 3000);
    try {
      // パートナーとの話は、このタブの中にあるものを、日報を開いたときだけ材料として渡す。サーバーは中身を残さない
      const { ok, data } = await postDaily({ action: "sync", conversation: loadTalk(viewerName).slice(-40) });
      if (!ok) {
        setFailed(true);
        return;
      }
      setReport((data.report as DailyReport | null) ?? null);
      // 夕方の係は、画面の裏で静かに走らせる。できたら日報に足される
      if (data.eveningDue === true) void evening();
    } catch {
      setFailed(true);
    } finally {
      window.clearTimeout(slowTimer);
      setSlow(false);
      setSyncing(false);
    }
  }

  async function evening() {
    try {
      const { ok, data } = await postDaily({ action: "evening" });
      if (ok && data.madeBy === "agent" && data.report) setReport(data.report as DailyReport);
    } catch {
      // 係が使えなくても、日報はそのまま使える
    }
  }

  useEffect(() => {
    // 開発時の二重の呼び出しで、Claude を2回呼ばないように
    if (started.current) return;
    started.current = true;
    void sync();
  }, []);

  async function toggle(itemId: string, checked: boolean) {
    if (!report || updating) return;
    setNotice("");
    setUpdating(itemId);
    const { ok } = await postDaily({ action: "check", itemId, checked }).catch(() => ({ ok: false }));
    if (ok) {
      setReport({ ...report, items: report.items.map((i) => (i.id === itemId ? { ...i, checked } : i)) });
    } else {
      setNotice("変えられませんでした。もう一度押してください。");
    }
    setUpdating(null);
  }

  async function finishEditing() {
    if (!report || !editing) return;
    setNotice("");
    setUpdating("edit");
    let items = report.items;
    for (const item of report.items) {
      const text = (editing[item.id] ?? item.text).trim();
      if (text === item.text || text === "") continue;
      const { ok } = await postDaily({ action: "edit", itemId: item.id, text }).catch(() => ({ ok: false }));
      if (!ok) {
        setNotice("直せませんでした。もう一度押してください。");
        setReport({ ...report, items });
        setUpdating(null);
        return;
      }
      items = items.map((i) => (i.id === item.id ? { ...i, text, edited: true } : i));
    }
    setReport({ ...report, items });
    setEditing(null);
    setUpdating(null);
  }

  const to = recipients.map((r) => `${r.name}先生`).join("、");
  const canSend = recipients.length > 0;
  const hasItems = Boolean(report && report.items.length > 0);

  return (
    <>
      <section className="card" aria-label={`今日の${noun}`}>
        {hasItems && report ? (
          <>
            <p className="muted">
              {canSend
                ? `チェックを付けた項目だけが、${to}に届きます。付けなければ誰にも届きません。`
                : "自分の記録です。誰にも届きません。"}
            </p>
            {editing
              ? report.items.map((item, index) => (
                  <textarea
                    key={item.id}
                    aria-label={`${index + 1}つ目の項目を直す`}
                    value={editing[item.id] ?? item.text}
                    rows={2}
                    maxLength={200}
                    style={{ width: "100%", marginBottom: "0.5rem" }}
                    onChange={(event) => setEditing({ ...editing, [item.id]: event.target.value })}
                  />
                ))
              : report.items.map((item) => (
                  <label className="daily-item" key={item.id}>
                    {canSend && (
                      <input
                        type="checkbox"
                        checked={item.checked}
                        disabled={updating !== null}
                        onChange={(event) => void toggle(item.id, event.target.checked)}
                      />
                    )}
                    <span>{item.text}</span>
                  </label>
                ))}
            {syncing && (
              <p className="muted" role="status">
                新しい分を足しています…
              </p>
            )}
            {report.madeBy === "agent" && <p className="muted">夕方の係がまとめました</p>}
            {!syncing &&
              (editing ? (
                <button type="button" disabled={updating !== null} onClick={() => void finishEditing()}>
                  {updating === "edit" ? "直しています…" : "直し終わる"}
                </button>
              ) : (
                <button type="button" className="secondary" disabled={updating !== null} onClick={() => setEditing({})}>
                  言葉を直す
                </button>
              ))}
          </>
        ) : syncing ? (
          // 0-1n：できるまで、日報の形を出し、光の帯を流す
          <div className="draft-skeleton" role="status">
            <span className="visually-hidden">今日の{noun}をまとめています</span>
            <i aria-hidden="true" />
            <i aria-hidden="true" />
            <i aria-hidden="true" />
            {slow && <small>今日のやり取りから、項目ごとにまとめています…</small>}
          </div>
        ) : failed ? null : (
          <p className="muted">今日はまだまとめるものがありません。話したり、届けたりすると、ここにたまります。</p>
        )}
        {failed && (
          <>
            <p className="notice" role="alert">
              パートナーにつながらず、まとめられませんでした。
            </p>
            <button type="button" className="secondary" onClick={() => void sync()}>
              もう一度まとめる
            </button>
          </>
        )}
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
