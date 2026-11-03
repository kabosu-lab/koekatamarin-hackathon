"use client";

import { useState } from "react";
import { hotlineList } from "./hotlines";

export type SafetyNotice = {
  alertId: string;
  counselingOpen: boolean;
  candidates: { id: string; name: string; label: string }[];
};

export function SafetyCard({ notice }: { notice: SafetyNotice }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [sharedNames, setSharedNames] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [disputed, setDisputed] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [disputeProblem, setDisputeProblem] = useState("");

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  }

  async function share() {
    setBusy(true);
    setProblem("");
    try {
      const response = await fetch("/api/safety/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertId: notice.alertId, personIds: selected }),
      });
      if (!response.ok) throw new Error(`status ${response.status}`);
      setSharedNames(notice.candidates.filter((c) => selected.includes(c.id)).map((c) => c.name));
      setSelected([]);
    } catch {
      setProblem("伝えられませんでした。もう一度押してください。");
    } finally {
      setBusy(false);
    }
  }

  async function dispute() {
    setDisputing(true);
    setDisputeProblem("");
    try {
      const response = await fetch("/api/safety/dispute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertId: notice.alertId }),
      });
      if (!response.ok) throw new Error(`status ${response.status}`);
      setDisputed(true);
    } catch {
      setDisputeProblem("届けられませんでした。もう一度押してください。");
    } finally {
      setDisputing(false);
    }
  }

  return (
    <section className="safety-card" aria-label="相談室に伝えました">
      <h2>相談室の先生に、要点だけ伝えました</h2>
      <p>話した言葉そのものは伝えていません。ほかの先生全員に流れることもありません。</p>
      {notice.counselingOpen ? (
        <p>相談室の先生が、声をかけてくれます。</p>
      ) : (
        <p>
          <strong>いま相談室は閉まっています。</strong>
          先生が見るのは次に開くときです。今すぐ話したいときは、下の窓口につながります。
        </p>
      )}
      <p>必要なときは、学校が外の機関に相談することもあります。どこまで進むのかは、相談室の先生に聞いて大丈夫です。</p>

      {disputed ? (
        <p role="status">相談室の先生にも「違うよ」と届けました。知らせは取り消されません。</p>
      ) : (
        <>
          <button type="button" disabled={disputing} onClick={() => void dispute()}>
            違うよ
          </button>
          {disputeProblem && <p role="alert">{disputeProblem}</p>}
        </>
      )}

      <h3>今すぐ話せるところ</h3>
      <ul>
        {hotlineList.map((line) => (
          <li key={line.name}>
            {line.name}
            {line.note && `（${line.note}）`}
            <span className="tel">{line.number}</span>
          </li>
        ))}
      </ul>

      {notice.candidates.length > 0 && (
        <>
          <h3>ほかにも伝えたい先生がいれば、選べます</h3>
          <ul>
            {notice.candidates.map((candidate) => (
              <li key={candidate.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={selected.includes(candidate.id)}
                    onChange={() => toggle(candidate.id)}
                  />
                  {candidate.name}（{candidate.label}）
                </label>
              </li>
            ))}
          </ul>
          <button type="button" disabled={busy || selected.length === 0} onClick={() => void share()}>
            選んだ先生にも伝える
          </button>
          {problem && <p role="alert">{problem}</p>}
          {sharedNames.length > 0 && <p role="status">{sharedNames.join("、")}先生にも伝えました。</p>}
        </>
      )}

      <p className="caveat">相棒は AI なので、見逃すことも、間違えることもあります。つらいときは、近くの大人にも直接話してください。</p>
    </section>
  );
}
