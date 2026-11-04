"use client";

import { useState } from "react";
import type { HiddenPerson } from "@/lib/hidden-people";

/** しばらく出していない人。本人にしか見えず、いつでも戻せる。 */
export function HiddenPeople({ initial }: { initial: HiddenPerson[] }) {
  const [hidden, setHidden] = useState(initial);
  const [problem, setProblem] = useState("");

  async function showAgain(personId: string) {
    setProblem("");
    const response = await fetch("/api/hidden", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personId, hidden: false }),
    }).catch(() => null);
    if (response?.ok) setHidden((current) => current.filter((person) => person.id !== personId));
    else setProblem("戻せませんでした。もう一度押してください。");
  }

  if (hidden.length === 0) return null;
  return (
    <section className="card hidden-people" aria-label="しばらく出していない人">
      <h2>しばらく出していない人</h2>
      <p className="muted">この一覧はあなたにしか見えません。相手にも伝わりません。</p>
      {problem && (
        <p className="notice" role="alert">
          {problem}
        </p>
      )}
      <ul>
        {hidden.map((person) => (
          <li key={person.id}>
            {person.name}（{person.label}）{" "}
            <button type="button" className="secondary" onClick={() => void showAgain(person.id)}>
              また出す
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
