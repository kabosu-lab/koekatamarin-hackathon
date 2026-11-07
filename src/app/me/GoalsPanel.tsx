"use client";

import Link from "next/link";
import { useState } from "react";
import type { Goal, Nudge } from "@/lib/goals";

const NUDGE_CHOICES = [
  ["gentle", "そっと"],
  ["blunt", "耳が痛め"],
] as const;

export function GoalsPanel({ initial, initialNudge }: { initial: Goal[]; initialNudge: Nudge }) {
  const [goals, setGoals] = useState(initial);
  const [nudge, setNudge] = useState(initialNudge);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [justDone, setJustDone] = useState<Goal | null>(null);
  const [notice, setNotice] = useState("");
  /** 促し方を替えたときの小さな知らせ */
  const [nudgeSaid, setNudgeSaid] = useState("");

  async function call(body: Record<string, unknown>): Promise<boolean> {
    setNotice("");
    const response = await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as { goals?: Goal[]; nudge?: Nudge; error?: string } | null;
    if (!response?.ok || !data?.goals || !data.nudge) {
      setNotice(data?.error ?? "うまくいきませんでした。もう一度押してください。");
      return false;
    }
    setGoals(data.goals);
    setNudge(data.nudge);
    return true;
  }

  return (
    <section className="card goals" aria-label="頑張りたいこと">
      <h2>頑張りたいこと</h2>
      <p className="muted">あなただけのものです。パートナーが話の中で背中を押します。できなくても減りません。</p>

      <form
        className="goal-add"
        onSubmit={(event) => {
          event.preventDefault();
          void call({ action: "add", text }).then((ok) => ok && setText(""));
        }}
      >
        <input aria-label="頑張りたいことを足す" placeholder="例：毎日10分歩く" value={text} onChange={(event) => setText(event.target.value)} />
        <button type="submit" disabled={text.trim() === ""}>
          足す
        </button>
      </form>
      {justDone && (
        <div className="goal-done" role="status">
          <p>やったね！みんなに言っておく？</p>
          <div className="row">
            <Link className="goal-tell" href={`/?goal=${justDone.id}`}>
              みんなに言っておく
            </Link>
            <button type="button" className="secondary" onClick={() => setJustDone(null)}>
              自分だけでいい
            </button>
          </div>
        </div>
      )}

      <ul className="goal-list">
        {goals.map((goal) => (
          <li key={goal.id} data-status={goal.status}>
            {editing === goal.id ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void call({ action: "edit", id: goal.id, text: editText }).then((ok) => ok && setEditing(null));
                }}
              >
                <input aria-label="頑張りたいことを直す" value={editText} onChange={(event) => setEditText(event.target.value)} />
                <button type="submit" className="secondary">
                  直す
                </button>
              </form>
            ) : (
              <>
                <p>
                  {goal.text}
                  {goal.status === "done" && <span className="goal-mark">（できた）</span>}
                </p>
                <div className="row">
                  {goal.status === "active" ? (
                    <button
                      type="button"
                      onClick={() => void call({ action: "done", id: goal.id }).then((ok) => ok && setJustDone(goal))}
                    >
                      できた
                    </button>
                  ) : (
                    <button type="button" className="secondary" onClick={() => void call({ action: "reopen", id: goal.id })}>
                      もう一度頑張る
                    </button>
                  )}
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setEditing(goal.id);
                      setEditText(goal.text);
                    }}
                  >
                    直す
                  </button>
                  <button type="button" className="secondary" onClick={() => void call({ action: "delete", id: goal.id })}>
                    消す
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>

      <p className="muted" id="goal-nudge-label">
        パートナーの促し方
      </p>
      {/* 2つで1組の切り替え。選んだほうを塗る（見た目は globals.css の選んだ印と同じ） */}
      <div className="row nudge-choice" role="group" aria-labelledby="goal-nudge-label">
        {NUDGE_CHOICES.map(([value, label]) => (
          <button
            key={value}
            type="button"
            className="secondary"
            aria-pressed={nudge === value}
            onClick={() =>
              void call({ action: "nudge", nudge: value }).then((ok) => setNudgeSaid(ok ? `「${label}」にしました` : ""))
            }
          >
            {label}
          </button>
        ))}
      </div>
      <p className="muted">近い話が出たとき、パートナーがこの言い方で背中を押します</p>
      <p className="muted nudge-said" role="status">
        {nudgeSaid}
      </p>


      {notice && (
        <p className="notice" role="alert">
          {notice}
        </p>
      )}
    </section>
  );
}
