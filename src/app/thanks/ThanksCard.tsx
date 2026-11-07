"use client";

import { type SyntheticEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { playReachedSound } from "@/app/sound";
import { readThanksKind, sentNotice, THANKS_KINDS, type ThanksKind } from "@/lib/thanks-kind";
import { Avatar } from "../Avatar";
import { BottomSheet } from "../BottomSheet";
import { Icon } from "../Icon";
import "./thanks.css";

export type ThanksPerson = { id: string; name: string; label: string };
export type RecentPerson = ThanksPerson & { image: string };

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok, data };
}

/** 言葉から読み取った絵柄。種類を選ぶ欄は置かない（0-2j(4)） */
export function ThanksKindMark({ kind }: { kind: ThanksKind }) {
  const { label, icon } = THANKS_KINDS[kind];
  return (
    <span className="thanks-kind" data-kind={kind}>
      <Icon name={icon} />
      {label}
    </span>
  );
}

/**
 * 相手が決まったあとの、言葉と肩書きの欄。相手を探す欄は持たない。
 * 送れたら onSent に知らせる（入口のシートはそこで閉じる）。
 */
export function ThanksComposer({
  to,
  initialMessage = "",
  onSent,
}: {
  to: ThanksPerson;
  initialMessage?: string;
  onSent?(notice: string): void;
}) {
  const [message, setMessage] = useState(initialMessage);
  const [title, setTitle] = useState("");
  const [ideas, setIdeas] = useState<string[]>([]);
  const [thinking, setThinking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const kind = readThanksKind(message);

  // 押したときだけ Claude が案を出す。贈るかどうかを決めるのは送る人
  async function suggest() {
    setThinking(true);
    setNotice("");
    try {
      const { ok, data } = await postJson("/api/titles/suggest", { toPersonId: to.id });
      if (ok && Array.isArray(data.titles)) {
        setIdeas(data.titles as string[]);
        if (data.titles.length === 0) setNotice("案を出せるだけの言葉が、まだありません。自分の言葉で贈れます。");
      } else {
        setNotice("案を作れませんでした。自分の言葉でも贈れます。");
      }
    } catch {
      setNotice("案を作れませんでした。自分の言葉でも贈れます。");
    } finally {
      setThinking(false);
    }
  }

  async function send() {
    setBusy(true);
    setNotice("");
    try {
      const { ok, data } = await postJson("/api/thanks", { toPersonId: to.id, message, ...(title.trim() ? { title } : {}) });
      if (ok) {
        const done = sentNotice(to.name, kind);
        playReachedSound();
        setMessage("");
        setTitle("");
        setIdeas([]);
        setNotice(done);
        onSent?.(done);
      } else {
        setNotice(typeof data.error === "string" ? data.error : "まだ送っていません。もう一度押してください。");
      }
    } catch {
      setNotice("まだ送っていません。もう一度押してください。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="thanks-composer" data-kind={kind}>
      <label>
        届けることば
        <textarea
          rows={3}
          maxLength={2000}
          value={message}
          placeholder="ありがとう・頑張ってたね・おめでとう"
          onChange={(event) => setMessage(event.target.value)}
        />
      </label>
      {message.trim() !== "" && (
        <p className="thanks-kind-line" aria-live="polite">
          カードの絵柄：<ThanksKindMark kind={kind} />
        </p>
      )}
      <label>
        肩書きを添える（なくても送れます）
        <input type="text" maxLength={20} value={title} placeholder="文化祭動画の師匠" onChange={(event) => setTitle(event.target.value)} />
      </label>
      <div className="row title-ideas">
        <button type="button" className="secondary" disabled={thinking} onClick={() => void suggest()}>
          {thinking ? "考えています…" : "案を出す"}
        </button>
        {ideas.map((idea) => (
          <button type="button" className="secondary" key={idea} onClick={() => setTitle(idea)}>
            {idea}
          </button>
        ))}
      </div>
      <button type="button" disabled={busy || message.trim() === ""} onClick={() => void send()}>
        サンクスカードを送る
      </button>
      {notice && <p role="status">{notice}</p>}
    </div>
  );
}

/** 選んだ相手。押すと探し直せる */
function Chosen({ person, onClear }: { person: ThanksPerson; onClear(): void }) {
  return (
    <p className="thanks-to">
      <span>
        <strong>{person.name}さん</strong>へ<small>（{person.label}）</small>
      </span>
      <button type="button" className="secondary" onClick={onClear}>
        相手を変える
      </button>
    </p>
  );
}

/**
 * 「履歴と設定」の「ありがとう」の中の送り先さがし。一覧から選ばせず（800人では選べない）、
 * 最近やりとりした人のチップと、打つと絞り込む欄だけ。
 */
export function ThanksPicker({ recent }: { recent: RecentPerson[] }) {
  const [to, setTo] = useState<ThanksPerson | null>(null);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<ThanksPerson[]>([]);
  const [searched, setSearched] = useState("");
  const [lastNotice, setLastNotice] = useState("");

  useEffect(() => {
    const q = query.trim();
    if (q === "") return;
    let stale = false;
    const timer = window.setTimeout(() => {
      fetch(`/api/thanks/people?q=${encodeURIComponent(q)}`)
        .then((response) => (response.ok ? response.json() : { people: [] }))
        .then((data: { people?: ThanksPerson[] }) => {
          if (stale) return;
          setFound(data.people ?? []);
          setSearched(q);
        })
        .catch(() => {
          if (!stale) setSearched(q);
        });
    }, 150);
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  function choose(person: ThanksPerson) {
    setTo(person);
    setLastNotice("");
  }

  const q = query.trim();
  const results = q === "" ? [] : found;

  return (
    <section className="card thanks-picker" aria-label="サンクスカードを送る">
      <h2>ことばを届けたい人は？</h2>
      {to ? (
        <>
          <Chosen person={to} onClear={() => setTo(null)} />
          <ThanksComposer
            key={to.id}
            to={to}
            onSent={(notice) => {
              setLastNotice(notice);
              setTo(null);
              setQuery("");
            }}
          />
        </>
      ) : (
        <>
          {recent.length > 0 && (
            <div className="thanks-chips" role="group" aria-label="最近やりとりした人">
              {recent.map((person) => (
                <button type="button" className="thanks-chip" key={person.id} onClick={() => choose(person)}>
                  <Avatar image={person.image} alt="" size={28} lazy />
                  {person.name}さん
                </button>
              ))}
            </div>
          )}
          <label>
            名前で探す
            <input
              type="search"
              value={query}
              maxLength={40}
              placeholder="名前の一部・学年・教科・部活"
              autoComplete="off"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          {q !== "" && (
            <ul className="thanks-found" aria-label="見つかった人">
              {results.map((person) => (
                <li key={person.id}>
                  <button type="button" onClick={() => choose(person)}>
                    <strong>{person.name}さん</strong>
                    <small>{person.label}</small>
                  </button>
                </li>
              ))}
              {searched === q && results.length === 0 && <li className="muted">見つかりませんでした。</li>}
            </ul>
          )}
          {lastNotice && <p role="status">{lastNotice}</p>}
        </>
      )}
    </section>
  );
}

const stop = (event: SyntheticEvent) => event.stopPropagation();

/**
 * 助けてもらった場所に置く「ありがとう」（0-2j(1)）。押すと、その人宛てのカードが下からのシートで開く。
 * シートは body に出す（めくるカードの中では position: fixed が効かないため）。
 */
export function ThanksEntry({
  person,
  label = "ありがとう",
  initialMessage,
  reply = false,
}: {
  person: ThanksPerson;
  label?: "ありがとう" | "おめでとう" | "頑張ってたね";
  initialMessage?: string;
  /** 0-3a：届いたカードへの「ありがとうを返す」 */
  reply?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  // みんなの画面には入口がたくさん並ぶので、シートは初めて押したときに作る
  const [mounted, setMounted] = useState(false);
  const closeTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  function show() {
    if (mounted) {
      setOpen(true);
      return;
    }
    setMounted(true);
    // 閉じた形で一度置いてから開くと、せり上がりの動きが出る
    requestAnimationFrame(() => setOpen(true));
  }
  const icon = label === "おめでとう" ? "star" : label === "頑張ってたね" ? "flag" : "heart";

  return (
    <>
      <button
        type="button"
        className="thanks-entry"
        aria-haspopup="dialog"
        aria-label={reply ? `${person.name}さんにありがとうを返す` : `${person.name}さんに${label}を送る`}
        data-sent={sent ? "" : undefined}
        onClick={show}
      >
        <Icon name={icon} />
        <span>{sent ? "届きました" : reply ? "ありがとうを返す" : label}</span>
      </button>
      {mounted &&
        createPortal(
          // 下のめくる部品（今日の3人・みんなの横なで）に指の動きを渡さない
          <div className="thanks-sheet-host" data-noswipe onKeyDown={stop} onPointerDown={stop} onPointerMove={stop} onPointerUp={stop} onClick={stop} onTouchStart={stop} onTouchEnd={stop}>
            <BottomSheet open={open} onClose={() => setOpen(false)} label={`${person.name}さんへのサンクスカード`}>
              <section className="thanks-sheet" aria-label="サンクスカードを送る">
                <h2>{person.name}さんへ</h2>
                <p className="muted">{person.label}</p>
                <ThanksComposer
                  to={person}
                  initialMessage={initialMessage ?? (label === "ありがとう" ? "" : `${label}！`)}
                  onSent={() => {
                    setSent(true);
                    // 届いた知らせを少し見せてから、自動で閉じる
                    closeTimer.current = window.setTimeout(() => setOpen(false), 1200);
                  }}
                />
              </section>
            </BottomSheet>
          </div>,
          document.body,
        )}
    </>
  );
}
