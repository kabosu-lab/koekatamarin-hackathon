"use client";

import { useState } from "react";
import type { RibbonView } from "@/lib/ribbons";

/** 集めたリボン。順位はなく、減らない。プロフィールに出すかは1つずつ本人が選ぶ。 */
export function Ribbons({ initial }: { initial: RibbonView[] }) {
  const [ribbons, setRibbons] = useState(initial);
  const [problem, setProblem] = useState("");

  async function toggle(id: string, isPublic: boolean) {
    setProblem("");
    const response = await fetch("/api/ribbons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "public", id, isPublic }),
    }).catch(() => null);
    if (response?.ok) setRibbons((list) => list.map((r) => (r.id === id ? { ...r, isPublic } : r)));
    else setProblem("変えられませんでした。もう一度押してください。");
  }

  return (
    <section className="card ribbons" aria-label="リボン">
      <h2>リボン</h2>
      {ribbons.length === 0 ? (
        <p className="muted">誰かの役に立つと届きます。</p>
      ) : (
        <ul className="ribbon-list">
          {ribbons.map((ribbon) => (
            <li key={ribbon.id}>
              <span className="ribbon-mark" aria-hidden="true" />
              <div>
                <strong>{ribbon.name}</strong>
                <small>{ribbon.description}</small>
                <label>
                  <input type="checkbox" checked={ribbon.isPublic} onChange={(event) => void toggle(ribbon.id, event.target.checked)} />
                  プロフィールに出す
                </label>
              </div>
            </li>
          ))}
        </ul>
      )}
      {problem && (
        <p className="notice" role="alert">
          {problem}
        </p>
      )}
    </section>
  );
}
