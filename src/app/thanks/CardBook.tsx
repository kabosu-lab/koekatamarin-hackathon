"use client";

import { THANKS_KINDS, THANKS_REVEAL_EVENT, THANKS_VIEW_EVENT, type ThanksKind } from "@/lib/thanks-kind";
import { Icon } from "../Icon";
import { type RevealCard, ThanksReveal } from "./ThanksReveal";
import "./card-book.css";

const KIND_ORDER: readonly ThanksKind[] = ["thanks", "effort", "congrats"];

/**
 * 0-3c：受け取ったサンクスカードの「カード帳」。封筒の演出と同じ絵柄の小さなカードを、新しい順に並べる。
 * - この端末でまだ開けていないカードは、封筒の形で先頭に置く（押すと 0-3a の開封の演出）
 * - カードを押すと、封筒のときと同じ大きさでくるっと表を向き、全文と「ありがとうを返す」
 */
export function CardBook({ viewerId, cards, envelopes }: { viewerId: string; cards: RevealCard[]; envelopes: RevealCard[] }) {
  const sealed = new Set(envelopes.map((card) => card.id));
  const opened = cards.filter((card) => !sealed.has(card.id));
  const total = cards.length;
  const counts = KIND_ORDER.map((kind) => ({ kind, n: cards.filter((card) => card.kind === kind).length })).filter((c) => c.n > 0);

  return (
    <section className="card card-book" aria-label="もらったありがとう">
      <h2>
        もらったカード <span className="card-book-total">{total}枚</span>
      </h2>
      {counts.length > 0 && (
        <p className="card-book-kinds">
          {counts.map(({ kind, n }) => (
            <span key={kind} data-kind={kind}>
              <Icon name={THANKS_KINDS[kind].icon} />
              {THANKS_KINDS[kind].label} {n}
            </span>
          ))}
        </p>
      )}
      {total === 0 ? (
        <p className="card-book-empty">最初の1枚は、誰かの役に立ったときに届きます</p>
      ) : (
        <ul className="card-book-grid">
          {envelopes.map((card) => (
            <li key={card.id}>
              <button
                type="button"
                className="card-book-envelope"
                aria-label={`${card.fromName}さんからの封筒を開ける`}
                onClick={() => window.dispatchEvent(new CustomEvent(THANKS_REVEAL_EVENT))}
              >
                <span className="card-book-seal" aria-hidden="true">
                  <Icon name="thanks" />
                </span>
                <small>{card.fromName}さんから</small>
              </button>
            </li>
          ))}
          {opened.map((card) => (
            <li key={card.id}>
              <button
                type="button"
                className="card-book-card"
                data-kind={card.kind}
                aria-label={`${card.fromName}さんからの${THANKS_KINDS[card.kind].label}を読む`}
                onClick={() => window.dispatchEvent(new CustomEvent(THANKS_VIEW_EVENT, { detail: card }))}
              >
                <span className="card-book-kind">
                  <Icon name={THANKS_KINDS[card.kind].icon} />
                  {THANKS_KINDS[card.kind].label}
                </span>
                <span className="card-book-words">{card.message}</span>
                <small className="card-book-from">{card.fromName}さん</small>
              </button>
            </li>
          ))}
        </ul>
      )}
      <ThanksReveal viewerId={viewerId} cards={envelopes} />
    </section>
  );
}
