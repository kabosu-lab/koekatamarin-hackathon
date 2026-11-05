"use client";

import { useState } from "react";
import type { RibbonView, ShelfSlot, TrophyShelf } from "@/lib/ribbons";
import { Sticker, StickerShadow } from "../Sticker";

const dateFormat = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric" });

function slotLabel(slot: ShelfSlot): string {
  if (slot.state === "earned") return slot.trophy.name;
  if (slot.state === "open") return `${slot.name}（まだ）`;
  return "隠しトロフィー";
}

function SlotDetail({
  slot,
  isPublic,
  onToggle,
}: {
  slot: ShelfSlot;
  isPublic: boolean;
  onToggle(trophy: RibbonView, isPublic: boolean): void;
}) {
  if (slot.state === "secret") {
    return (
      <div className="trophy-detail">
        <strong>隠しトロフィー</strong>
        <span>取るまで、条件はひみつです。</span>
      </div>
    );
  }
  if (slot.state === "open") {
    return (
      <div className="trophy-detail">
        <strong>{slot.name}</strong>
        <span>{slot.description}</span>
      </div>
    );
  }
  const { trophy } = slot;
  return (
    <div className="trophy-detail">
      <strong>{trophy.name}</strong>
      <span className="ribbon-story">{trophy.story}</span>
      {trophy.storyAt && <span className="ribbon-date">{dateFormat.format(new Date(trophy.storyAt))}</span>}
      {trophy.quip && <span className="trophy-quip">{trophy.quip}</span>}
      {trophy.selfOnly ? (
        <span className="muted">あなただけに見えます。</span>
      ) : (
        <label>
          <input type="checkbox" checked={isPublic} onChange={(event) => onToggle(trophy, event.target.checked)} />
          プロフィールに出す
        </label>
      )}
    </div>
  );
}

/** 集めたトロフィー。順位はなく、減らない。プロフィールに出すかは1つずつ本人が選ぶ。 */
export function Ribbons({ shelves }: { shelves: TrophyShelf[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [publicIds, setPublicIds] = useState(
    () => new Set(shelves.flatMap((shelf) => shelf.slots.flatMap((slot) => (slot.state === "earned" && slot.trophy.isPublic ? [slot.trophy.id] : [])))),
  );
  const [problem, setProblem] = useState("");

  async function toggle(trophy: RibbonView, isPublic: boolean) {
    setProblem("");
    const response = await fetch("/api/ribbons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "public", id: trophy.id, isPublic }),
    }).catch(() => null);
    if (!response?.ok) {
      setProblem("変えられませんでした。もう一度押してください。");
      return;
    }
    setPublicIds((current) => {
      const next = new Set(current);
      if (isPublic) next.add(trophy.id);
      else next.delete(trophy.id);
      return next;
    });
  }

  const anyEarned = shelves.some((shelf) => shelf.slots.some((slot) => slot.state === "earned"));

  return (
    <section className="card ribbons" aria-label="トロフィー">
      <h2>トロフィー</h2>
      {!anyEarned && <p className="muted">誰かの役に立つと届きます。</p>}
      {shelves.map((shelf) => {
        const open = shelf.slots.find((slot) => slot.key === selected);
        return (
          <div key={shelf.category} className="trophy-shelf" data-complete={shelf.complete}>
            <h3>
              {shelf.label}
              {shelf.complete && <span className="trophy-shelf-done">そろいました</span>}
            </h3>
            <ul className="trophy-slots">
              {shelf.slots.map((slot) => (
                <li key={slot.key} data-slot={slot.state === "secret" ? undefined : slot.key} data-earned={slot.state === "earned"}>
                  <button
                    type="button"
                    className="trophy-slot"
                    aria-label={slotLabel(slot)}
                    aria-pressed={selected === slot.key}
                    onClick={() => setSelected((current) => (current === slot.key ? null : slot.key))}
                  >
                    {slot.state === "earned" ? <Sticker art={slot.trophy.art} /> : <StickerShadow />}
                  </button>
                </li>
              ))}
            </ul>
            {open && <SlotDetail slot={open} isPublic={open.state === "earned" && publicIds.has(open.trophy.id)} onToggle={(trophy, value) => void toggle(trophy, value)} />}
          </div>
        );
      })}
      {problem && (
        <p className="notice" role="alert">
          {problem}
        </p>
      )}
    </section>
  );
}
