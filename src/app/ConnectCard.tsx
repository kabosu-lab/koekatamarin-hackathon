"use client";

export type ConnectSuggestion = {
  personId: string;
  name: string;
  label: string;
  message: string;
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
        {suggestion.name}さん（{suggestion.label}）
      </p>
      <div className="connect-actions">
        <button type="button" disabled={busy} onClick={onAccept}>
          聞いてみる
        </button>
        <button type="button" className="secondary" disabled={busy} onClick={onDecline}>
          今はいい
        </button>
      </div>
    </section>
  );
}
