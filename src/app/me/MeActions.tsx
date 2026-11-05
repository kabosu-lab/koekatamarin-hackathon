"use client";

import { playReachedSound } from "@/app/sound";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { MemoryItem } from "@/lib/memory";
import type { ProfileDraft } from "@/lib/profile";
import { PhotoHatch } from "./PhotoHatch";

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok, data };
}

type Question = {
  question: string;
  options: readonly { value: string; label: string }[];
};

export function AvatarQuiz({ kindQuestion, styleQuestion }: { kindQuestion: Question; styleQuestion: Question }) {
  const router = useRouter();
  const [kind, setKind] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  async function choose(style: string) {
    setBusy(true);
    setProblem("");
    const { ok } = await postJson("/api/avatar", { kind, style }).catch(() => ({ ok: false }));
    if (ok) router.refresh();
    else setProblem("うまくいきませんでした。もう一度押してください。");
    setBusy(false);
  }

  const question = kind ? styleQuestion : kindQuestion;
  return (
    <section className="card" aria-label="最初の問いかけ">
      <h2>{question.question}</h2>
      <div className="row">
        {question.options.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={busy}
            onClick={() => (kind ? void choose(option.value) : setKind(option.value))}
          >
            {option.label}
          </button>
        ))}
      </div>
      {problem && (
        <p className="notice" role="alert">
          {problem}
        </p>
      )}
    </section>
  );
}

export function ProfileEditor({ initialDraft, hasProfile }: { initialDraft: ProfileDraft | null; hasProfile: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState(initialDraft);
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function run(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setNotice("");
    try {
      const { ok, data } = await postJson("/api/profile", { action, ...extra });
      if (!ok) {
        setNotice(typeof data.error === "string" ? data.error : "うまくいきませんでした。");
        return;
      }
      if (action === "draft" || action === "revise") {
        const next = data.draft as ProfileDraft | null;
        if (!next) setNotice("まだ材料が足りないみたい。校内でやり取りすると、作れるようになります。");
        setDraft(next);
        setRequest("");
      } else {
        setDraft(null);
        router.refresh();
      }
    } catch {
      setNotice("うまくいきませんでした。もう一度押してください。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {draft ? (
        <div className="card" aria-label="プロフィールの下書き" role="group">
          <h2>こう載せていい？</h2>
          <p className="draft-text">{draft.text}</p>
          <div className="row confirm-row">
            <button type="button" disabled={busy} onClick={() => void run("publish")}>
              これで載せる
            </button>
            <button type="button" className="secondary" disabled={busy} onClick={() => void run("discard")}>
              載せない
            </button>
          </div>
          {draft.revised ? (
            <p className="muted">言葉で直せるのは、更新ごとに1回です。</p>
          ) : (
            <>
              <label>
                ここをこう変えて（更新ごとに1回）
                <textarea rows={2} maxLength={200} value={request} onChange={(event) => setRequest(event.target.value)} />
              </label>
              <button
                type="button"
                className="secondary"
                disabled={busy || request.trim() === ""}
                onClick={() => void run("revise", { request })}
              >
                この頼みで直す
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="row confirm-row">
          <button type="button" disabled={busy} onClick={() => void run("draft")}>
            プロフィールを更新する
          </button>
          {hasProfile && (
            <button type="button" className="secondary" disabled={busy} onClick={() => void run("remove")}>
              プロフィールを消す
            </button>
          )}
        </div>
      )}
      {notice && (
        <p className="notice" role="alert">
          {notice}
        </p>
      )}
    </div>
  );
}

export function MemoryList({ initial }: { initial: MemoryItem[] }) {
  const [items, setItems] = useState(initial);
  const [problem, setProblem] = useState("");

  async function forget(item: MemoryItem) {
    setProblem("");
    const { ok } = await postJson("/api/memory", { action: "forget", id: item.id, kind: item.kind }).catch(() => ({
      ok: false,
    }));
    if (ok) setItems((current) => current.filter((i) => i.id !== item.id));
    else setProblem("消せませんでした。もう一度押してください。");
  }

  return (
    <section className="card" aria-label="パートナーが覚えていること">
      <h2>パートナーが覚えていること</h2>
      <p className="muted">
        公開した言葉は、話すときと人を紹介するときに使います。「覚えて」と頼んだことは、あなたとの話にだけ使います。
      </p>
      {items.length === 0 && <p className="muted">まだ何も覚えていません。</p>}
      {items.map((item) => (
        <div className="memory-item" key={item.id}>
          <p>
            <span className="muted">{item.kind === "spoken" ? "覚えてと頼んだこと" : "公開した言葉"}</span>
            <br />
            {item.text}
          </p>
          <button type="button" className="secondary" onClick={() => void forget(item)}>
            忘れて
          </button>
        </div>
      ))}
      {problem && (
        <p className="notice" role="alert">
          {problem}
        </p>
      )}
    </section>
  );
}

export function ThanksForm({ people }: { people: { id: string; name: string; label: string }[] }) {
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const [title, setTitle] = useState("");
  const [ideas, setIdeas] = useState<string[]>([]);
  const [thinking, setThinking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  // 押したときだけ Claude が案を出す。贈るかどうかを決めるのは送る人
  async function suggest() {
    setThinking(true);
    setNotice("");
    try {
      const { ok, data } = await postJson("/api/titles/suggest", { toPersonId: to });
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
      const { ok, data } = await postJson("/api/thanks", { toPersonId: to, message, ...(title.trim() ? { title } : {}) });
      if (ok) {
        const name = people.find((p) => p.id === to)?.name ?? "";
        setNotice(`${name}さんに、ありがとうが届きました。`);
        playReachedSound();
        setMessage("");
        setTo("");
        setTitle("");
        setIdeas([]);
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
    <section className="card" aria-label="サンクスカードを送る">
      <h2>今週助けてくれた人は？</h2>
      <label>
        送る相手
        <select value={to} onChange={(event) => setTo(event.target.value)}>
          <option value="">選んでください</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}（{p.label}）
            </option>
          ))}
        </select>
      </label>
      <label>
        ありがとうの言葉
        <textarea rows={2} maxLength={2000} value={message} onChange={(event) => setMessage(event.target.value)} />
      </label>
      <label>
        肩書きを添える（なくても送れます）
        <input type="text" maxLength={20} value={title} placeholder="文化祭動画の師匠" onChange={(event) => setTitle(event.target.value)} />
      </label>
      <div className="row title-ideas">
        <button type="button" className="secondary" disabled={thinking || to === ""} onClick={() => void suggest()}>
          {thinking ? "考えています…" : "案を出す"}
        </button>
        {ideas.map((idea) => (
          <button type="button" className="secondary" key={idea} onClick={() => setTitle(idea)}>
            {idea}
          </button>
        ))}
      </div>
      <button type="button" disabled={busy || to === "" || message.trim() === ""} onClick={() => void send()}>
        サンクスカードを送る
      </button>
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}

/** 本人が押したときだけ、登録した写真を読む。読み終わるまで、誕生の演出を見せる。 */
export function AvatarFromPhoto({ label, failed, eggImage }: { label: string; failed: boolean; eggImage: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [hatching, setHatching] = useState(false);
  const [problem, setProblem] = useState("");

  async function start() {
    setBusy(true);
    setProblem("");
    const { ok, data } = await postJson("/api/avatar/photo", {}).catch(() => ({ ok: false, data: {} as Record<string, unknown> }));
    if (ok) setHatching(true);
    else setProblem(typeof data.error === "string" ? data.error : "うまくいきませんでした。もう一度押してください。");
    setBusy(false);
  }

  return (
    <section className="card" aria-label="写真からパートナーを作る">
      <h2>{label}から、声のかたまりを作る</h2>
      {failed && <p className="notice">前回はうまく読めなかったので、シンプルな絵にしています。もう一度試せます。</p>}
      <p className="muted">
        写真の色や持ち物の雰囲気から、合うパートナーを選びます。本人に似せることはしません。写真は Claude に1度だけ見せて、保存しません。
      </p>
      <button type="button" disabled={busy} onClick={() => void start()}>
        写真から作る
      </button>
      {problem && (
        <p className="notice" role="alert">
          {problem}
        </p>
      )}
      {hatching && (
        <PhotoHatch
          eggImage={eggImage}
          onFailed={() => {
            setHatching(false);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}


/** 裏で選んでいる間だけ、ときどき画面を新しくする。 */
export function ArtRefresher() {
  const router = useRouter();
  useEffect(() => {
    let count = 0;
    const timer = setInterval(() => {
      if (++count > 40) clearInterval(timer);
      else router.refresh();
    }, 3000);
    return () => clearInterval(timer);
  }, [router]);
  return <p className="muted" role="status">パートナーを選んでいます。ほかのことをしていて大丈夫です。</p>;
}
