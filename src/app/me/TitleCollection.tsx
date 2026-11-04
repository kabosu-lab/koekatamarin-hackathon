"use client";

import { useState } from "react";
import type { TitleEntry } from "@/lib/titles";

/** もらった肩書き。自分では作れない。受け取るかは本人が決め、1つ選ぶと名前の横に出る。 */
export function TitleCollection({ initial }: { initial: TitleEntry[] }) {
  const [titles, setTitles] = useState(initial);
  const [problem, setProblem] = useState("");
  if (titles.length === 0) {
    return (
      <section className="card titles" aria-label="もらった肩書き">
        <h2>もらった肩書き</h2>
        <p className="muted">肩書きは、自分では作れません。ありがとうと一緒に、誰かから届きます。</p>
      </section>
    );
  }

  async function act(id: string, action: "accept" | "decline" | "wear" | "unwear" | "remove") {
    setProblem("");
    const response = await fetch("/api/titles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    }).catch(() => null);
    if (!response?.ok) {
      setProblem("変更できませんでした。もう一度押してください。");
      return;
    }
    setTitles((current) =>
      current
        .filter((title) => !(title.id === id && (action === "decline" || action === "remove")))
        .map((title) => {
          if (action === "accept" && title.id === id) return { ...title, state: "accepted" as const };
          if (action === "wear") return { ...title, worn: title.id === id };
          if (action === "unwear" && title.id === id) return { ...title, worn: false };
          return title;
        }),
    );
  }

  return (
    <section className="card titles" aria-label="もらった肩書き">
      <h2>もらった肩書き</h2>
      <p className="muted">選んだ1つが名前の横に出ます。受け取るまで、誰にも見えません。断っても相手には伝わりません。</p>
      <ul className="title-list">
        {titles.map((title) => (
          <li key={title.id}>
            <div>
              <strong>{title.title}</strong>
              <small>{title.fromName}さんから</small>
            </div>
            <div className="row">
              {title.state === "offered" ? (
                <>
                  <button type="button" onClick={() => void act(title.id, "accept")}>
                    受け取る
                  </button>
                  <button type="button" className="secondary" onClick={() => void act(title.id, "decline")}>
                    受け取らない
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="secondary"
                    aria-pressed={title.worn}
                    onClick={() => void act(title.id, title.worn ? "unwear" : "wear")}
                  >
                    {title.worn ? "外す" : "名前の横に出す"}
                  </button>
                  <button type="button" className="secondary" onClick={() => void act(title.id, "remove")}>
                    手放す
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
      {problem && <p role="alert">{problem}</p>}
    </section>
  );
}
