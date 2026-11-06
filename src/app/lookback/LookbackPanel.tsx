"use client";

import { useState } from "react";

type Option = { value: string; label: string };

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ok: response.ok, data: (await response.json().catch(() => ({}))) as Record<string, unknown> };
}

/**
 * 長い期間（この一年・卒業まで）のふりかえりを、読むだけ。保存も送ることもしない。
 * 0-2b：Teams へ届けるのは、学期のふりかえりの「選んで、確かめて、送る」道だけ（言葉を確かめずに送れる道はなくした）。
 * period を渡すとその期間だけ、periods を渡すと期間の札を並べる。
 */
export function LookbackPanel({ periods, period }: { periods?: Option[]; period?: Option }) {
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function write(value: string) {
    setBusy(true);
    setNotice("");
    setText(null);
    try {
      const { ok, data } = await postJson("/api/lookback", { period: value });
      if (!ok) throw new Error("failed");
      if (data.ready === true && typeof data.text === "string") setText(data.text);
      else setNotice("この期間のやり取りがまだ少ないみたい。もう少しあとで作れます。");
    } catch {
      setNotice("作れませんでした。もう一度押してください。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {period ? (
        <section className="card" aria-label={`${period.label}のふりかえり`}>
          <h2>{period.label}のふりかえり</h2>
          <p className="muted">読むだけです。保存も共有もしません。残したり届けたりは、学期ごとのふりかえりでできます。</p>
          <button type="button" className={text ? "secondary" : undefined} disabled={busy} onClick={() => void write(period.value)}>
            {text ? "書き直してもらう" : "パートナーにふりかえりを書いてもらう"}
          </button>
        </section>
      ) : (
        <section className="card" aria-label="期間を選ぶ">
          <h2>いつをふりかえりますか？</h2>
          <p className="muted">あなたにだけ見えます。保存も共有もしません。</p>
          <div className="row">
            {periods?.map((option) => (
              <button key={option.value} type="button" disabled={busy} onClick={() => void write(option.value)}>
                {option.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {text && (
        <section className="card" aria-label="あなたのふりかえり">
          <h2>あなたのふりかえり</h2>
          <p className="lookback-text">{text}</p>
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
