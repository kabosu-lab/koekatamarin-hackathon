"use client";

import { useState } from "react";
import type { Review } from "@/lib/claude/compose";
import type { Portfolio, PortfolioEntry, PortfolioKind } from "@/lib/portfolio";
import type { Recipient } from "@/lib/recipients";
import { BottomSheet } from "../BottomSheet";

type Channel = { id: string; name: string };
type Scope = "everyone" | "managers";

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ok: response.ok, data: (await response.json().catch(() => ({}))) as Record<string, unknown> };
}

const errorOf = (data: Record<string, unknown>, fallback: string) => (typeof data.error === "string" ? data.error : fallback);

const GROUPS: { kind: PortfolioKind; label: string }[] = [
  { kind: "post", label: "あなたの投稿" },
  { kind: "thanks", label: "もらったありがとう" },
  { kind: "knowledge", label: "あなたの言葉が入った知恵" },
  { kind: "trophy", label: "トロフィー" },
];

const keyOf = (entry: PortfolioEntry) => `${entry.kind}:${entry.ref}`;

function EntryBody({ entry }: { entry: PortfolioEntry }) {
  return (
    <>
      <span className="portfolio-meta">
        {entry.date}　{entry.label}
      </span>
      <span className="lookback-text">{entry.text}</span>
      {entry.detail && <span className="portfolio-meta">{entry.detail}</span>}
    </>
  );
}

type Props = {
  initial: Portfolio;
  channels: Channel[];
  recipients: Recipient[];
  viewerName: string;
  noun: string;
  rewards: boolean;
};

export function PortfolioPanel({ initial, channels, recipients, viewerName, noun, rewards }: Props) {
  const [portfolio, setPortfolio] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [reflectionDraft, setReflectionDraft] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Teams へ届ける流れ。開くのも選ぶのも本人で、初めは何も選ばれていない
  const [sharing, setSharing] = useState(false);
  const [picks, setPicks] = useState<string[]>([]);
  const [draft, setDraft] = useState<string | null>(null);
  const [channelId, setChannelId] = useState("");
  const [scope, setScope] = useState<Scope | "">("");
  const [review, setReview] = useState<Review | null>(null);
  const [sentPostId, setSentPostId] = useState<string | null>(null);

  const term = portfolio.term.id;

  async function act(body: Record<string, unknown>, failure: string): Promise<Record<string, unknown> | null> {
    setBusy(true);
    setNotice("");
    try {
      const { ok, data } = await postJson("/api/portfolio", { ...body, term });
      if (!ok) {
        setNotice(errorOf(data, failure));
        return null;
      }
      if (data.portfolio) setPortfolio(data.portfolio as Portfolio);
      return data;
    } catch {
      setNotice(failure);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function writeReflection() {
    const data = await act({ action: "reflect" }, "作れませんでした。もう一度押してください。");
    if (!data) return;
    if (data.ready === true && typeof data.text === "string") setReflectionDraft(data.text);
    else setNotice("この学期のやり取りがまだ少ないみたい。もう少しあとで作れます。");
  }

  async function saveReflection() {
    if (await act({ action: "save-reflection", text: reflectionDraft }, "残せませんでした。もう一度押してください。")) setReflectionDraft(null);
  }

  async function removeEntry(entry: PortfolioEntry) {
    if (await act({ action: "remove", kind: entry.kind, ref: entry.ref }, "外せませんでした。もう一度押してください。")) {
      setPicks((current) => current.filter((key) => key !== keyOf(entry)));
    }
  }

  function togglePick(key: string, on: boolean) {
    setPicks((current) => (on ? [...current, key] : current.filter((k) => k !== key)));
  }

  async function makeDraft() {
    const data = await act({ action: "share-draft", picks }, "下書きを作れませんでした。もう一度押してください。");
    if (data && typeof data.draft === "string") {
      setDraft(data.draft);
      setReview(null);
      setSentPostId(null);
    }
  }

  function editDraft(text: string) {
    setDraft(text);
    // 直したら、確かめ直す
    setReview(null);
  }

  async function checkDraft() {
    setBusy(true);
    setNotice("");
    try {
      const { ok, data } = await postJson("/api/review", { text: draft });
      if (ok) setReview(data.review as Review);
      else setNotice(errorOf(data, "確かめられませんでした。もう一度押してください。"));
    } catch {
      setNotice("確かめられませんでした。もう一度押してください。");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    setBusy(true);
    setNotice("");
    try {
      const { ok, data } = await postJson("/api/publish", { text: draft, channelId, kind: "report", scope });
      if (!ok) {
        setNotice(errorOf(data, "まだ送っていません。もう一度押してください。"));
        return;
      }
      setSentPostId(data.postId as string);
      setDraft(null);
      setReview(null);
      setPicks([]);
      setChannelId("");
      setScope("");
    } catch {
      setNotice("まだ送っていません。もう一度押してください。");
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    setBusy(true);
    setNotice("");
    try {
      const { ok, data } = await postJson("/api/publish/undo", { postId: sentPostId });
      if (ok) {
        setSentPostId(null);
        setNotice("取り消しました。");
      } else {
        setNotice(errorOf(data, "もう取り消せません"));
      }
    } catch {
      setNotice("取り消せませんでした。もう一度押してください。");
    } finally {
      setBusy(false);
    }
  }

  const shareableEntries = portfolio.added.filter((entry) => entry.shareable);
  const hasShareable = shareableEntries.length > 0 || portfolio.days.length > 0;
  const toManagers = recipients.map((r) => r.name).join("、");

  return (
    <>
      <section className="card" aria-label="この学期のふりかえり">
        <h2>{portfolio.term.label}のふりかえり</h2>
        {portfolio.reflection && reflectionDraft === null && <p className="lookback-text">{portfolio.reflection}</p>}
        {reflectionDraft !== null ? (
          <>
            <label>
              パートナーが書いた案です。直して残せます
              <textarea value={reflectionDraft} rows={8} onChange={(event) => setReflectionDraft(event.target.value)} />
            </label>
            <button type="button" disabled={busy || reflectionDraft.trim() === ""} onClick={() => void saveReflection()}>
              残す
            </button>
            <button type="button" className="secondary" disabled={busy} onClick={() => setReflectionDraft(null)}>
              残さない
            </button>
          </>
        ) : (
          <>
            <button type="button" className={portfolio.reflection ? "secondary" : undefined} disabled={busy} onClick={() => void writeReflection()}>
              {portfolio.reflection ? "書き直してもらう" : "パートナーにふりかえりを書いてもらう"}
            </button>
            {portfolio.reflection && (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void act({ action: "delete-reflection" }, "消せませんでした。もう一度押してください。")}
              >
                ふりかえりを消す
              </button>
            )}
          </>
        )}
        <p className="muted">
          成績や評価ではありません。材料は{noun}、投稿、もらったありがとう、足したもので、パートナーとの話そのものは渡しません。押して残すまで保存しません。
        </p>
      </section>

      {/* 0-2b：足したものと、たまった日報・日記を「残したもの」1枚に。足すのはボトムシートから */}
      <section className="card" aria-label="残したもの">
        <div className="portfolio-head">
          <h2>残したもの</h2>
          <button type="button" className="secondary" disabled={busy} onClick={() => setAdding(true)}>
            足す
          </button>
        </div>
        {portfolio.added.length === 0 && <p className="muted">「足す」から、残したいものを選べます。何も足さなくても大丈夫です。</p>}
        {portfolio.added.map((entry) => (
          <div className="portfolio-entry" key={keyOf(entry)}>
            <EntryBody entry={entry} />
            <button type="button" className="secondary" disabled={busy} onClick={() => void removeEntry(entry)}>
              外す
            </button>
          </div>
        ))}
        <section className="portfolio-days" aria-label={`たまった${noun}`}>
          <h3>たまった{noun}</h3>
          {portfolio.days.length === 0 ? (
            <p className="muted">この学期の{noun}はまだありません。</p>
          ) : (
            portfolio.days.map((day) => (
              <details className="portfolio-day" key={day.id}>
                <summary>{day.date}</summary>
                <ul>
                  {day.items.map((item) => (
                    <li key={item.id}>{item.text}</li>
                  ))}
                </ul>
              </details>
            ))
          )}
        </section>
      </section>

      <BottomSheet open={adding} onClose={() => setAdding(false)} label="足せるもの">
        <h2>足せるもの</h2>
        <p className="muted">足すかどうかは、あなたが決めます。</p>
        {!rewards && <p className="muted">トロフィーを隠している間は、ここにも出しません。</p>}
        {portfolio.candidates.length === 0 && <p className="muted">いま足せるものはありません。</p>}
        {GROUPS.map((group) => {
          const entries = portfolio.candidates.filter((entry) => entry.kind === group.kind);
          if (entries.length === 0) return null;
          return (
            <details className="portfolio-day" key={group.kind}>
              <summary>{group.label}</summary>
              {entries.map((entry) => (
                <div className="portfolio-entry" key={keyOf(entry)}>
                  <EntryBody entry={entry} />
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => void act({ action: "add", kind: entry.kind, ref: entry.ref }, "足せませんでした。もう一度押してください。")}
                  >
                    足す
                  </button>
                </div>
              ))}
            </details>
          );
        })}
      </BottomSheet>

      <section className="card" aria-label="Teams へ届ける">
        <h2>Teams へ届ける</h2>
        <p className="muted">届けなくて大丈夫です。届けたいときだけ、あなたが項目を選び、確かめて送ります。</p>
        {!sharing ? (
          <button type="button" className="secondary" disabled={busy} onClick={() => setSharing(true)}>
            届ける項目を選ぶ
          </button>
        ) : (
          <>
            {!hasShareable && <p className="muted">届けられる項目はまだありません。</p>}
            {portfolio.days.flatMap((day) =>
              day.items.map((item) => (
                <label className="daily-item" key={item.id}>
                  <input
                    type="checkbox"
                    checked={picks.includes(`daily:${item.id}`)}
                    onChange={(event) => togglePick(`daily:${item.id}`, event.target.checked)}
                  />
                  <span>
                    {day.date} {noun}：{item.text}
                  </span>
                </label>
              )),
            )}
            {shareableEntries.map((entry) => (
              <label className="daily-item" key={keyOf(entry)}>
                <input type="checkbox" checked={picks.includes(keyOf(entry))} onChange={(event) => togglePick(keyOf(entry), event.target.checked)} />
                <span>
                  {entry.label}：{entry.text}
                </span>
              </label>
            ))}
            <p className="muted">
              ありがとう、範囲を絞った投稿、教職員だけのチャネルの投稿、プロフィールに出せないトロフィー、ふりかえりの文章は、ここには出ません。
            </p>
            <button type="button" disabled={busy || picks.length === 0} onClick={() => void makeDraft()}>
              下書きを作る
            </button>
          </>
        )}

        {draft !== null && (
          <div aria-label="送る前の確認" role="group">
            <label>
              Teams にはこう見えます（{viewerName}の名前で届きます。直せます）
              <textarea value={draft} rows={8} onChange={(event) => editDraft(event.target.value)} />
            </label>
            <p className="muted">人の名前や、本人に断っていない話が入っていないか、確かめてください。</p>
            <label>
              チャネル
              <select value={channelId} onChange={(event) => setChannelId(event.target.value)}>
                <option value="">選んでください</option>
                {channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              見える範囲
              <select value={scope} onChange={(event) => setScope(event.target.value as Scope | "")}>
                <option value="">選んでください</option>
                <option value="everyone">チャネルのみんな</option>
                {recipients.length > 0 && <option value="managers">管理職や担任だけ（{toManagers}）</option>}
              </select>
            </label>
            {review && review.verdict !== "ok" && (
              <p className="notice" role="alert">
                {review.perception}
              </p>
            )}
            {review?.alternatives.map((alternative) => (
              <button type="button" className="secondary" key={alternative} disabled={busy} onClick={() => editDraft(alternative)}>
                「{alternative}」に直す
              </button>
            ))}
            {review === null ? (
              <button type="button" disabled={busy || draft.trim() === ""} onClick={() => void checkDraft()}>
                言葉を確かめる
              </button>
            ) : (
              review.verdict !== "block" && (
                <button type="button" disabled={busy || channelId === "" || scope === ""} onClick={() => void send()}>
                  本人として送る
                </button>
              )
            )}
            <button type="button" className="secondary" disabled={busy} onClick={() => setDraft(null)}>
              やめる
            </button>
          </div>
        )}

        {sentPostId && (
          <>
            <p className="seen-note" role="status">
              あなたの名前で届きました。
            </p>
            <button type="button" className="secondary" disabled={busy} onClick={() => void undo()}>
              取り消す
            </button>
          </>
        )}
      </section>

      {notice && (
        <p className="seen-note" role="status">
          {notice}
        </p>
      )}
    </>
  );
}
