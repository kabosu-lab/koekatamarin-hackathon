"use client";

import Link from "next/link";
import { type CSSProperties, type MouseEvent, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Connection, ConnectionKind, SoFarStory as Story } from "@/lib/so-far";
import { BottomSheet } from "../BottomSheet";
import { collapseColumn, expandColumn } from "../so-far-full";
import { playCommitPop, playReachedSound } from "../sound";
import { type Growth, parseSeen, planStory, seenKey, seenOf, type StoryPlan } from "./so-far-seen";
import "./so-far-story.css";

/** シートがせり上がってから（220ms）、全部の項目が同時に動き出す */
const DELAY_MS = 260;
/** 伸びる・数え上がる長さ */
const GROW_MS = 900;
const MAX_POP_STEP = 10;
/** シートが閉じる動き（BottomSheet の EXIT_MS）を待ってから、列の大きさに戻す */
const EXIT_MS = 180;

const BARS: { key: keyof Story["counts"]; label: string; helped: boolean; note: string }[] = [
  { key: "posts", label: "届けた", helped: false, note: "届けた：あなたが本人として送った投稿の数。話して、光ったら、とどけると増えます" },
  { key: "comments", label: "返した", helped: false, note: "返した：人の投稿に書いた返事の数。誰かの投稿に返事を書くと増えます" },
  { key: "cheers", label: "応援", helped: false, note: "応援：人の投稿に送った応援の数。投稿の応援を押すと増えます" },
  {
    key: "goals",
    label: "解決",
    helped: true,
    note: "解決：あなたに聞かれた質問に、あなたが返事をした数。「聞いてみる」で届いた問いに答えると増えます",
  },
  {
    key: "assists",
    label: "つないだ",
    helped: true,
    note: "つないだ：あなたが回した投稿に、回した先の人が返事をした数。詳しい人に回すと増えます",
  },
  { key: "thanks", label: "ありがとう", helped: true, note: "ありがとう：あなたがもらったありがとうの数。人の役に立って、ありがとうが届くと増えます" },
];

/** パネルを押したときの一文（何を数えているか、どうすると増えるか） */
const NOTES = {
  bars: "積み上がり：左の3本はあなたが動いた数、右の3本は人の役に立った数。棒を押すと、1本ずつの意味が出ます",
  days: "届いた日：この学期に、あなたの投稿・返事・ありがとう・日報が人に届いた日。届けた日に点が灯ります",
  people: "つながり：やり取りした人。やり取りが多い人ほど名前が大きくなります。名前を押すと、やり取りの数が出ます",
  leaves: "あなたの葉：この年度に、あなたが校内の桜に足した葉の数。投稿・返事・ありがとう・応援・自習で1枚ずつ増えます",
  partner: "パートナーの育ち：人とのやり取りで、声のかたまりから動物へ育ちます。話すだけでは育ちません",
  trophies: "トロフィー：この学期に届いたトロフィー。人とのやり取りの節目で届きます",
  first: "はじまりの日：今日の一言が、最初の葉になります。届けると、ここから積み上がります",
} as const;

const FACT_LABELS: Record<ConnectionKind, string> = {
  thanksGot: "ありがとうをもらった",
  thanksSent: "ありがとうを送った",
  repliesGot: "返事をもらった",
  repliesSent: "返事をした",
  reportWords: "日報に一言をもらった",
  passed: "回した",
};

export function factsLine(person: Connection): string {
  return person.facts.map((fact) => `${FACT_LABELS[fact.kind]} ${fact.count}回`).join("・");
}

const css = (vars: Record<string, string | number>) => vars as CSSProperties;

function monthDay(date: string): string {
  const [, month, day] = date.split("-").map(Number);
  return `${month}/${day}`;
}

/** 押した一文・名札の出し入れ。同じものをもう一度押すと消える */
type Tip = { open: string | null; toggle: (id: string) => (event: MouseEvent) => void };

/** 数え上げ。動かさないときは最初から今の値。終わりは必ず今の値ちょうどで止まる */
function CountUp({ growth, run }: { growth: Growth; run: boolean }) {
  const animate = run && growth.grew;
  const [value, setValue] = useState(animate ? growth.from : growth.to);
  useEffect(() => {
    if (!animate) return;
    let frame = 0;
    let begin = 0;
    const tick = (now: number) => {
      if (!begin) begin = now + DELAY_MS;
      const t = Math.min(1, Math.max(0, (now - begin) / GROW_MS));
      const eased = 1 - (1 - t) ** 3;
      setValue(t >= 1 ? growth.to : Math.round(growth.from + (growth.to - growth.from) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animate, growth.from, growth.to]);
  return <>{value}</>;
}

/** 動いた項目の印（画面テストが見る） */
const grewAttrs = (growth: Growth, run: boolean) =>
  run && growth.grew ? { "data-grew": "", "data-from": growth.from, "data-to": growth.to } : { "data-to": growth.to };

function Egg() {
  return (
    <svg className="so-far-egg" viewBox="0 0 40 50" aria-hidden="true">
      <path d="M20 2C9 2 2 20 2 31a18 18 0 0 0 36 0C38 20 31 2 20 2Z" />
    </svg>
  );
}

/** 積み上がり。棒の高さは値に合わせる。0 の項目は棒も下地も出さず「これから」とだけ。棒を押すと、その意味 */
function PanelBars({ story, plan, run, tip }: { story: Story; plan: StoryPlan; run: boolean; tip: Tip }) {
  const max = Math.max(1, ...BARS.map((bar) => story.counts[bar.key]));
  return (
    <div className="so-far-bars">
      {BARS.map((bar, index) => {
        const growth = plan.counts[bar.key];
        const value = story.counts[bar.key];
        const helpedFirst = bar.helped && !BARS[index - 1]?.helped;
        return (
          <button
            type="button"
            className="so-far-bar"
            key={bar.key}
            data-key={bar.key}
            data-helped={bar.helped ? "" : undefined}
            data-helped-first={helpedFirst ? "" : undefined}
            data-zero={value === 0 ? "" : undefined}
            aria-expanded={tip.open === `bar:${bar.key}`}
            onClick={tip.toggle(`bar:${bar.key}`)}
            {...grewAttrs(growth, run)}
          >
            <span className="so-far-track">
              {value > 0 && (
                <i
                  className="so-far-fill"
                  data-grew={run && growth.grew ? "" : undefined}
                  style={css({ "--ratio": value / max, "--from": growth.from / value })}
                />
              )}
            </span>
            {value === 0 ? (
              <strong className="so-far-later">これから</strong>
            ) : (
              <strong>
                <CountUp growth={growth} run={run} />
              </strong>
            )}
            <small>{bar.label}</small>
          </button>
        );
      })}
    </div>
  );
}

/** 届いた日の点。学期の週×曜日の升に、届いた日だけが灯る。前より後に灯った日だけ弾む */
function PanelDays({ story, plan, run }: { story: Story; plan: StoryPlan; run: boolean }) {
  const end = new Date(`${story.today}T00:00:00Z`);
  let start = new Date(`${story.termStart}T00:00:00Z`);
  if (story.few) start = new Date(end.getTime() - 27 * 86_400_000);
  // 週の頭（月曜）にそろえる
  start = new Date(start.getTime() - ((start.getUTCDay() + 6) % 7) * 86_400_000);
  const days: string[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += 86_400_000) days.push(new Date(t).toISOString().slice(0, 10));
  const reached = new Set(story.reachedDays);
  const study = new Set(story.studyDays);
  // 新しく灯った日＝届いた日のうち、新しいほうから増えた分
  const freshList = run && plan.days.grew ? story.reachedDays.slice(plan.days.from) : [];
  const gap = freshList.length > 0 ? GROW_MS / Math.max(1, freshList.length) : 0;
  return (
    <div className="so-far-days-wrap">
      <div className="so-far-days" style={css({ "--weeks": Math.ceil(days.length / 7) })}>
        {days.map((day) => {
          const order = freshList.indexOf(day);
          return (
            <i
              key={day}
              data-reached={reached.has(day) ? "" : undefined}
              data-study={!reached.has(day) && study.has(day) ? "" : undefined}
              data-fresh={order >= 0 ? "" : undefined}
              style={order >= 0 ? css({ "--at": `${DELAY_MS + order * gap}ms` }) : undefined}
            />
          );
        })}
      </div>
      <p className="so-far-after" {...grewAttrs(plan.days, run)}>
        <CountUp growth={plan.days} run={run} />
        日、人に届いた
      </p>
      {story.studyDays.length > 0 && <small className="so-far-note">うすい点は、一緒に勉強した日</small>}
    </div>
  );
}

/** 大きい名前ほど真ん中寄りに（自分は置かない）。多い順の並びを、左右へ交互に振り分ける */
function centerOut<T>(items: T[]): T[] {
  const left: T[] = [];
  const right: T[] = [];
  items.forEach((item, index) => (index % 2 === 0 ? right : left).push(item));
  return [...left.reverse(), ...right];
}

/** つながり：ワードクラウド。名前の大きさはやり取りの多さ。押すと名札（名前・肩書・事実の数だけ） */
function PanelPeople({ story, plan, run, tip }: { story: Story; plan: StoryPlan; run: boolean; tip: Tip }) {
  const people = story.people;
  const cloud = useRef<HTMLDivElement>(null);
  // 箱に収まる人数（多い順）。収まらない人は「ほか N人」にまとめる。箱の大きさが変わったら（3列の上に広げたときなど）測り直す
  const [fit, setFit] = useState({ shown: people.length, turn: 0 });
  useLayoutEffect(() => {
    const box = cloud.current;
    if (!box || fit.shown <= 1) return;
    if (box.scrollHeight > box.clientHeight + 1 || box.scrollWidth > box.clientWidth + 1) {
      setFit((current) => ({ ...current, shown: current.shown - 1 }));
    }
  }, [fit]);
  useEffect(() => {
    const box = cloud.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    let size = `${box.clientWidth}x${box.clientHeight}`;
    const watch = new ResizeObserver(() => {
      const next = `${box.clientWidth}x${box.clientHeight}`;
      if (next === size) return;
      size = next;
      setFit((current) => ({ shown: people.length, turn: current.turn + 1 }));
    });
    watch.observe(box);
    return () => watch.disconnect();
  }, [people.length]);
  if (people.length === 0) return <p className="so-far-later so-far-center">これから</p>;
  const max = Math.max(1, ...people.map((person) => person.weight));
  const shown = people.slice(0, Math.max(1, fit.shown));
  const more = story.morePeople + people.length - shown.length;
  return (
    <div ref={cloud} className="so-far-cloud" data-more={more} style={css({ "--count": shown.length })}>
      {centerOut(shown).map((person) => {
        const fresh = run && plan.newPeople.has(person.id);
        return (
          <button
            type="button"
            key={person.id}
            className="so-far-name"
            data-person={person.id}
            data-weight={person.weight}
            data-grew={fresh ? "" : undefined}
            aria-expanded={tip.open === `person:${person.id}`}
            style={css({ "--s": Math.sqrt(person.weight / max) })}
            onClick={tip.toggle(`person:${person.id}`)}
          >
            {person.name}
          </button>
        );
      })}
      {more > 0 && <span className="so-far-more-people">ほか {more} 人</span>}
    </div>
  );
}

/** あなたの葉：校内の桜に足した分。新しい葉だけ枝へ飛んで着く（パートナーを隠しているときは文字だけ） */
function PanelLeaves({ story, plan, rewards, run }: { story: Story; plan: StoryPlan; rewards: boolean; run: boolean }) {
  const flying = Math.min(8, story.leaves);
  const already = run && plan.leaves.grew ? Math.min(8, plan.leaves.from) : flying;
  const gap = flying > already ? GROW_MS / (flying - already) : 0;
  return (
    <div className="so-far-tree">
      {rewards && (
        <svg className="so-far-branch" viewBox="0 0 320 90" aria-hidden="true">
          <path d="M0 70 C80 60 160 40 320 30" />
          {Array.from({ length: flying }, (_, index) => {
            const fresh = index >= already;
            return (
              <ellipse
                key={index}
                className="so-far-leaf"
                data-fresh={fresh ? "" : undefined}
                cx={30 + index * 36}
                cy={56 - index * 4.4}
                rx="9"
                ry="5"
                style={fresh ? css({ "--at": `${DELAY_MS + (index - already) * gap}ms` }) : undefined}
              />
            );
          })}
        </svg>
      )}
      <p className="so-far-leaves" {...grewAttrs(plan.leaves, run)}>
        葉 <CountUp growth={plan.leaves} run={run} />枚
      </p>
      <small className="so-far-note">校内の桜に足した分</small>
    </div>
  );
}

/** パートナーの育ち：声のかたまりから今の姿まで */
function PanelPartner({ story }: { story: Story }) {
  const stages = story.stageImages.length > 0 ? story.stageImages : [story.image];
  return (
    <div className="so-far-growth">
      <div className="so-far-stages">
        {stages.map((image, index) => (
          <span key={image} className="so-far-stage">
            {index > 0 && (
              <span className="so-far-arrow" aria-hidden="true">
                →
              </span>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt={index === stages.length - 1 ? "今のパートナー" : ""} width={40} height={40} />
          </span>
        ))}
      </div>
      <small className="so-far-note">{story.stageImages.length > 1 ? `${story.stageImages.length}つめの姿` : "これから育つ"}</small>
    </div>
  );
}

/** パートナーを隠しているとき：トロフィーを文字だけで */
function PanelTrophies({ story }: { story: Story }) {
  if (story.trophies.length === 0) return <p className="so-far-later so-far-center">これから</p>;
  return (
    <ul className="so-far-trophies">
      {story.trophies.slice(0, 3).map((name) => (
        <li key={name}>{name}</li>
      ))}
      {story.trophies.length > 3 && <li>ほか {story.trophies.length - 3}</li>}
    </ul>
  );
}

/** データ0の人：届いた日・つながり・葉の代わりの「はじまりの日」 */
function PanelFirstDay({ story, rewards }: { story: Story; rewards: boolean }) {
  return (
    <div className="so-far-first">
      <p className="so-far-big">{monthDay(story.today)}</p>
      {rewards && (
        <div className="so-far-path">
          <Egg />
          <svg className="so-far-branch" viewBox="0 0 200 60" aria-hidden="true">
            <path d="M0 50 C60 44 120 30 200 24" />
            <circle className="so-far-empty-leaf" cx="120" cy="22" r="7" />
          </svg>
        </div>
      )}
      <p>今日の一言が、最初の葉になる</p>
    </div>
  );
}

/** 1枚のグラフ。押すと意味の一文。中の棒や名前を押したときは、その一文か名札 */
function Panel({
  id,
  title,
  tip,
  notes,
  children,
}: {
  id: string;
  title: string;
  tip: Tip;
  /** このパネルで出しうる一文（パネルの id → 一文、棒の id → 一文、名前の id → 名札） */
  notes: Record<string, ReactNode>;
  children: ReactNode;
}) {
  const shown = tip.open !== null && tip.open in notes ? tip.open : null;
  return (
    <section className="so-far-panel" data-panel={id} aria-label={title} onClick={tip.toggle(id)}>
      <h2>
        <button type="button" className="so-far-title" aria-expanded={tip.open === id} onClick={tip.toggle(id)}>
          {title}
        </button>
      </h2>
      <div className="so-far-panel-body">{children}</div>
      {shown && (
        // 一文や名札そのものを押しても消える（下に隠れた棒や名前を、もう一度押すのと同じ）
        <div className="so-far-tip" aria-hidden="true" data-tip={shown} onClick={tip.toggle(shown)}>
          {notes[shown]}
        </div>
      )}
    </section>
  );
}

function readSeen(personId: string) {
  try {
    return parseSeen(window.localStorage.getItem(seenKey(personId)));
  } catch {
    // 読めなくても、初めて見たときと同じに描ける
    return null;
  }
}

/** 開いている間だけ置く。開いた瞬間に前に見た値を読み、描いたあとで今の値を覚える */
function Board({ story, rewards, personId }: { story: Story; rewards: boolean; personId: string }) {
  const [reduced] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true);
  const [plan] = useState(() => planStory(readSeen(personId), story));
  const run = !reduced;
  const [settled, setSettled] = useState(!run || !plan.any);
  const [openTip, setOpenTip] = useState<string | null>(null);
  const tip: Tip = {
    open: openTip,
    toggle: (id) => (event) => {
      event.stopPropagation();
      setOpenTip((current) => (current === id ? null : id));
    },
  };

  useEffect(() => {
    try {
      window.localStorage.setItem(seenKey(personId), JSON.stringify(seenOf(story)));
    } catch {
      // 覚えられなくても、見え方は変わらない
    }
    if (!plan.any) return;
    if (!run) {
      // 動かさない設定でも、増えたことは音で1回だけ伝える
      playCommitPop(MAX_POP_STEP);
      return;
    }
    const timers: number[] = [];
    const landing = DELAY_MS + GROW_MS;
    const grown = BARS.filter((bar) => plan.counts[bar.key].grew);
    grown.forEach((_, index) => timers.push(window.setTimeout(() => playCommitPop(Math.min(index + 1, MAX_POP_STEP)), landing + index * 70)));
    if (grown.some((bar) => bar.helped) || plan.days.grew || plan.newPeople.size > 0) {
      timers.push(window.setTimeout(() => playReachedSound(), landing + grown.length * 70 + 120));
    }
    timers.push(window.setTimeout(() => setSettled(true), landing + 200));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 開いた1回だけ
  }, []);

  // 一文や名札を開いているときの Esc は、それだけを閉じる（シートまでは閉じない）
  useEffect(() => {
    if (openTip === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      event.preventDefault();
      setOpenTip(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [openTip]);

  const since = story.firstDate ?? story.today;
  const barNotes = Object.fromEntries([["bars", NOTES.bars], ...BARS.map((bar) => [`bar:${bar.key}`, bar.note])]);
  const peopleNotes: Record<string, ReactNode> = { people: NOTES.people };
  for (const person of story.people) {
    peopleNotes[`person:${person.id}`] = (
      <span className="so-far-tag">
        <strong>{person.name}</strong>
        {person.label && <small>{person.label}</small>}
        <span>{factsLine(person)}</span>
      </span>
    );
  }
  // 読み上げ：知らせの入れ物はいつも置いておき、中身だけを差し替える
  const spoken = (() => {
    if (openTip === null) return "";
    if (openTip.startsWith("person:")) {
      const person = story.people.find((candidate) => `person:${candidate.id}` === openTip);
      return person ? [person.name, person.label, factsLine(person)].filter(Boolean).join("、") : "";
    }
    if (openTip.startsWith("bar:")) return BARS.find((bar) => `bar:${bar.key}` === openTip)?.note ?? "";
    return NOTES[openTip as keyof typeof NOTES] ?? "";
  })();
  const growth = rewards ? (
    <Panel id="partner" title="パートナーの育ち" tip={tip} notes={{ partner: NOTES.partner }}>
      <PanelPartner story={story} />
    </Panel>
  ) : (
    <Panel id="trophies" title="トロフィー" tip={tip} notes={{ trophies: NOTES.trophies }}>
      <PanelTrophies story={story} />
    </Panel>
  );
  return (
    <div
      className="so-far-board"
      data-reduced={reduced ? "" : undefined}
      data-settled={settled ? "" : undefined}
      onClick={() => setOpenTip(null)}
    >
      <p className="visually-hidden so-far-spoken" role="status">
        {spoken}
      </p>
      <header className="so-far-head">
        <p className="so-far-since">
          <strong>{monthDay(since)}</strong> から
        </p>
        {rewards && story.stageImages.length > 0 && (
          <div className="so-far-path" aria-hidden="true">
            <Egg />
            <span className="so-far-dash" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={story.image} alt="" width={36} height={36} />
          </div>
        )}
      </header>
      <div className="so-far-grid" data-empty={story.empty ? "" : undefined}>
        <Panel id="bars" title="積み上がり" tip={tip} notes={barNotes}>
          <PanelBars story={story} plan={plan} run={run} tip={tip} />
        </Panel>
        {story.empty ? (
          <Panel id="first" title="はじまりの日" tip={tip} notes={{ first: NOTES.first }}>
            <PanelFirstDay story={story} rewards={rewards} />
          </Panel>
        ) : (
          <>
            <Panel id="days" title="届いた日" tip={tip} notes={{ days: NOTES.days }}>
              <PanelDays story={story} plan={plan} run={run} />
            </Panel>
            <Panel id="people" title="つながり" tip={tip} notes={peopleNotes}>
              <PanelPeople story={story} plan={plan} run={run} tip={tip} />
            </Panel>
            <Panel id="leaves" title="あなたの葉" tip={tip} notes={{ leaves: NOTES.leaves }}>
              <PanelLeaves story={story} plan={plan} rewards={rewards} run={run} />
            </Panel>
          </>
        )}
        {growth}
      </div>
    </div>
  );
}

/**
 * 0-3h：横向きの3列（iPad 横・パソコン）では、「これまで」は左の列の iframe の中にある。
 * 開いている間だけ、その iframe を外側の画面いっぱいに広げて、3列の上に重ねる。閉じれば列の大きさに戻す。
 * 狭い画面（左右の画面 pane）や単独で開いたときは、何もしない（もともと全画面）。
 */
function useFullScreenInColumn(open: boolean) {
  const pending = useRef(0);
  useEffect(() => {
    if (!open) return;
    let frame: HTMLElement | null = null;
    let host: Window | null = null;
    try {
      if (window.self !== window.top) {
        frame = window.frameElement as HTMLElement | null;
        host = window.parent;
        // 閉じてすぐ開き直したときは、戻す待ちを取り消す
        if (frame) host.clearTimeout(pending.current);
      }
    } catch {
      // 別オリジンの枠の中では、広げない
      frame = null;
    }
    if (!frame || !host || frame.dataset.mode !== "column") return;
    expandColumn(frame);
    const target = frame;
    const outer = host;
    return () => {
      // シートが閉じる動きを待ってから戻す。列の中で別の画面へ移っても、外側の WidePanel の onLoad が戻す
      try {
        pending.current = outer.setTimeout(() => collapseColumn(target), EXIT_MS);
      } catch {
        collapseColumn(target);
      }
    };
  }, [open]);
}

/**
 * 0-2t：帯を押すと開く「これまで」のインフォグラフィック。全部のグラフを1画面に並べ、スクロールさせない。
 * 開いた瞬間、前に見たときから増えた項目だけが前の値から同時に伸び、数字も数え上がる。増えていない項目は今の値のまま。
 * 前に見た値は端末ごと（localStorage）。動きを減らす設定では動かさない。動かすのは transform と opacity だけ。
 * 0-3h：グラフを押すと意味の一文。つながりはワードクラウド（押すと名札）。葉とパートナーは別のグラフ。
 */
export function SoFarStory({
  open,
  onClose,
  story,
  rewards,
  personId,
}: {
  open: boolean;
  onClose: () => void;
  story: Story;
  rewards: boolean;
  personId: string;
}) {
  useFullScreenInColumn(open);
  return (
    <div className="so-far-story">
      <BottomSheet
        open={open}
        onClose={onClose}
        label="これまで"
        footer={
          <div className="so-far-actions">
            <Link href="/me?open=lookback" className="so-far-read">
              ふりかえりを読む
            </Link>
            <button type="button" className="secondary" onClick={onClose}>
              閉じる
            </button>
          </div>
        }
      >
        {open && <Board story={story} rewards={rewards} personId={personId} />}
      </BottomSheet>
    </div>
  );
}
