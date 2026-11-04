"use client";

import Link from "next/link";

export type ConnectSuggestion = {
  personId: string;
  name: string;
  label: string;
  message: string;
  /** 人ではなくチャネルを案内するとき */
  channelId?: string;
};

type Props = {
  suggestion: ConnectSuggestion;
  busy: boolean;
  onAccept(): void;
  onDecline(): void;
};

export function ConnectCard({ suggestion, busy, onAccept, onDecline }: Props) {
  return (
    <section className="connect-card" aria-label="人につなぐ提案">
      <p>{suggestion.message}</p>
      <p className="person">
        {suggestion.channelId ? suggestion.name : `${suggestion.name}さん（${suggestion.label}）`}
      </p>
      <div className="connect-actions">
        {suggestion.channelId ? (
          <Link href={`/teams?channel=${suggestion.channelId}`}>のぞいてみる</Link>
        ) : (
          <button type="button" disabled={busy} onClick={onAccept}>
            聞いてみる
          </button>
        )}
        <button type="button" className="secondary" disabled={busy} onClick={onDecline}>
          今はいい
        </button>
      </div>
    </section>
  );
}
