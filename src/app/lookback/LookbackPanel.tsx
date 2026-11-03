"use client";

import { useState } from "react";

type Option = { value: string; label: string };
type Channel = { id: string; name: string };

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ok: response.ok, data: (await response.json().catch(() => ({}))) as Record<string, unknown> };
}

export function LookbackPanel({ periods, channels }: { periods: Option[]; channels: Channel[] }) {
  const [text, setText] = useState<string | null>(null);
  const [channelId, setChannelId] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function write(period: string) {
    setBusy(true);
    setNotice("");
    setText(null);
    try {
      const { ok, data } = await postJson("/api/lookback", { period });
      if (!ok) throw new Error("failed");
      if (data.ready === true && typeof data.text === "string") setText(data.text);
      else setNotice("この期間のやり取りがまだ少ないみたい。もう少しあとで作れます。");
    } catch {
      setNotice("作れませんでした。もう一度押してください。");
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    setBusy(true);
    setNotice("");
    try {
      const { ok, data } = await postJson("/api/publish", { text, channelId, kind: "report" });
      if (ok) setNotice("校内チャネルに届きました。");
      else setNotice(typeof data.error === "string" ? data.error : "まだ送っていません。もう一度押してください。");
    } catch {
      setNotice("まだ送っていません。もう一度押してください。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="card" aria-label="期間を選ぶ">
        <h2>いつをふりかえりますか？</h2>
        <p className="muted">まずあなたにだけ見えます。保存もしません。</p>
        <div className="row">
          {periods.map((period) => (
            <button key={period.value} type="button" disabled={busy} onClick={() => void write(period.value)}>
              {period.label}
            </button>
          ))}
        </div>
      </section>

      {text && (
        <section className="card" aria-label="あなたのふりかえり">
          <h2>あなたのふりかえり</h2>
          <p className="lookback-text">{text}</p>
          <label>
            共有したいときは、チャネルを選びます（しなくて大丈夫です）
            <select value={channelId} onChange={(event) => setChannelId(event.target.value)}>
              <option value="">選んでください</option>
              {channels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="secondary" disabled={busy || channelId === ""} onClick={() => void share()}>
            本人として共有する
          </button>
        </section>
      )}

      {notice && (
        <p className="seen-note" role="status">
          {notice}
        </p>
      )}
    </>
  );
}
