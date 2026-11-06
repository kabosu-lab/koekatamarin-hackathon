"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { DailyReport, Recipient } from "@/lib/daily";
import { playSendSound, SendBurst } from "../SendBurst";
import { loadTalk } from "../talk-storage";
import "./daily.css";

/** 「届きました」「残しました」を見せてから、履歴と設定へ戻るまで（ms） */
const BACK_AFTER_MS = 1400;
const QUIET_BACK_AFTER_MS = 900;

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
  const [updating, setUpdating] = useState<string | null>(null);
  // 0-2u：チェックは「どれを届けるか」を選ぶだけ。押すまでは送らない（まだ届いていない項目の id）
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [delivering, setDelivering] = useState(false);
  const [done, setDone] = useState("");
  const [burst, setBurst] = useState<string | null>(null);
  const router = useRouter();
  // 呼び名は名字に「先生」（例：藤本先生）
  const to = recipients.map((r) => `${r.name.split(/\s/)[0]}先生`).join("、");
  const canSend = recipients.length > 0;
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

  function choose(itemId: string, on: boolean) {
    setNotice("");
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  }

  /** 0-2u：押した瞬間に、とどけると同じ動きと音を始め、送信は裏で進める。届いたら一言出して、履歴と設定へ戻る */
  async function deliver() {
    if (delivering) return;
    setNotice("");
    const chosen = (report?.items ?? []).filter((item) => !item.checked && selected.has(item.id));
    if (!canSend || chosen.length === 0) {
      setDelivering(true);
      setDone("残しました");
      return;
    }
    setDelivering(true);
    const words = chosen.map((item) => item.text).join(" ");
    setBurst(words);
    playSendSound(words);
    const { ok, data } = await postDaily({ action: "send", itemIds: chosen.map((item) => item.id) }).catch(() => ({
      ok: false,
      data: {} as Record<string, unknown>,
    }));
    if (!ok) {
      // 選んだものはそのまま残し、もう一度押せるようにする
      setDelivering(false);
      setNotice(`${to}に届けられませんでした。選んだものはそのままです。もう一度押してください。`);
      return;
    }
    if (data.report && report) {
      const fresh = data.report as DailyReport;
      setReport({ ...report, items: report.items.map((item) => fresh.items.find((f) => f.id === item.id) ?? item) });
    }
    setSelected(new Set());
    setDone(`${to}に届きました`);
  }

  // 届いた（残した）一言は、飛ぶ動きが終わってから見せ、少し置いて履歴と設定へ戻る
  useEffect(() => {
    if (!done || burst) return;
    const timer = window.setTimeout(() => router.push("/me"), done === "残しました" ? QUIET_BACK_AFTER_MS : BACK_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [done, burst, router]);

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

  const hasItems = Boolean(report && report.items.length > 0);
  const count = (report?.items ?? []).filter((item) => !item.checked && selected.has(item.id)).length;
  const sendLabel = canSend && count > 0 ? `${to}に届ける（${count}件）` : "自分だけに残す";

  return (
    <>
      <section className="card" aria-label={`今日の${noun}`}>
        {hasItems && report ? (
          <>
            <p className="muted">
              {canSend
                ? `チェックを付けた項目を、${to}に届けます。付けなければ自分だけの${noun}です。`
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
                        checked={item.checked || selected.has(item.id)}
                        disabled={item.checked || updating !== null || delivering}
                        onChange={(event) => choose(item.id, event.target.checked)}
                      />
                    )}
                    <span>{item.text}</span>
                    {item.checked && canSend && <small className="daily-sent">届けました</small>}
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

      {burst && <SendBurst words={burst} onDone={() => setBurst(null)} />}
      {!editing && (
        // 0-2u：いつも見える、届けるボタン1つ。文言は相手と件数で変わる
        <div className="daily-send-bar">
          {done ? (
            <p className="daily-done" role="status">
              {done}
            </p>
          ) : (
            <button type="button" className={count > 0 ? undefined : "secondary"} disabled={delivering || syncing} onClick={() => void deliver()}>
              {sendLabel}
            </button>
          )}
        </div>
      )}

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
