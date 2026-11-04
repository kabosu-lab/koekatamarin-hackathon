"use client";

import { useState } from "react";
import type { RibbonDefinition, RibbonView } from "@/lib/ribbons";
import { Sticker, StickerShape } from "../Sticker";

const dateFormat = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric" });

/** 花の形の台紙。全部そろうと、真ん中が灯って一枚の絵柄になる。数や割合は出さない。 */
function StickerBook({ slots, earned }: { slots: readonly RibbonDefinition[]; earned: Set<string> }) {
  const complete = slots.every((slot) => earned.has(slot.id));
  return (
    <>
      <div className="sticker-book" data-complete={complete} role="img" aria-label={complete ? "シール帳の花が完成しました" : "シール帳"}>
        <svg viewBox="-110 -110 220 220" aria-hidden="true">
          {slots.map((slot, index) => {
            const angle = (index * 2 * Math.PI) / slots.length - Math.PI / 2;
            const x = Math.round(Math.cos(angle) * 72);
            const y = Math.round(Math.sin(angle) * 72);
            return (
              <g key={slot.id} transform={`translate(${x} ${y})`} data-slot={slot.id} data-earned={earned.has(slot.id)}>
                {earned.has(slot.id) ? <StickerShape id={slot.id} /> : <circle r="28" className="sticker-slot-empty" />}
              </g>
            );
          })}
          <circle r="26" className="sticker-center" />
        </svg>
      </div>
      {complete && <p className="sticker-book-done">花が咲きました</p>}
    </>
  );
}

/** 集めたリボン。順位はなく、減らない。プロフィールに出すかは1つずつ本人が選ぶ。 */
export function Ribbons({
  initial,
  slots,
  eventSlots,
}: {
  initial: RibbonView[];
  slots: readonly RibbonDefinition[];
  eventSlots: readonly RibbonDefinition[];
}) {
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

  const earned = new Set(ribbons.map((ribbon) => ribbon.id));
  const events = eventSlots.filter((slot) => earned.has(slot.id));

  return (
    <section className="card ribbons" aria-label="リボン">
      <h2>リボン</h2>
      <StickerBook slots={slots} earned={earned} />
      {events.length > 0 && (
        <ul className="sticker-events" aria-label="期間限定のシール">
          {events.map((slot) => (
            <li key={slot.id}>
              <Sticker id={slot.id} />
              {slot.name}
            </li>
          ))}
        </ul>
      )}
      {ribbons.length === 0 ? (
        <p className="muted">誰かの役に立つと届きます。</p>
      ) : (
        <ul className="ribbon-list">
          {ribbons.map((ribbon) => (
            <li key={ribbon.id}>
              <Sticker id={ribbon.id} />
              <div>
                <strong>{ribbon.name}</strong>
                <span className="ribbon-story">{ribbon.story}</span>
                {ribbon.storyAt && <span className="ribbon-date">{dateFormat.format(new Date(ribbon.storyAt))}</span>}
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
