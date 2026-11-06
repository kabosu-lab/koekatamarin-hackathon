"use client";

import Link from "next/link";
import { type CSSProperties, type ReactNode, useEffect, useState } from "react";
import type { SoFarStory as Story } from "@/lib/so-far";
import { BottomSheet } from "../BottomSheet";
import { playCommitPop, playReachedSound } from "../sound";
import { type Growth, parseSeen, planStory, seenKey, seenOf, type StoryPlan } from "./so-far-seen";
import "./so-far-story.css";

/** シートがせり上がってから（220ms）、全部の項目が同時に動き出す */
const DELAY_MS = 260;
/** 伸びる・数え上がる長さ */
const GROW_MS = 900;
const MAX_POP_STEP = 10;

const BARS: { key: keyof Story["counts"]; label: string; helped: boolean }[] = [
  { key: "posts", label: "届けた", helped: false },
  { key: "comments", label: "返した", helped: false },
  { key: "cheers", label: "応援", helped: false },
  { key: "goals", label: "解決", helped: true },
  { key: "assists", label: "つないだ", helped: true },
  { key: "thanks", label: "ありがとう", helped: true },
];

const css = (vars: Record<string, string | number>) => vars as CSSProperties;

function monthDay(date: string): string {
  const [, month, day] = date.split("-").map(Number);
  return `${month}/${day}`;
}

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

/** 積み上がり。棒の高さは値に合わせる。0 の項目は棒も下地も出さず「これから」とだけ */
function PanelBars({ story, plan, run }: { story: Story; plan: StoryPlan; run: boolean }) {
  const max = Math.max(1, ...BARS.map((bar) => story.counts[bar.key]));
  return (
    <div className="so-far-bars">
      {BARS.map((bar, index) => {
        const growth = plan.counts[bar.key];
        const value = story.counts[bar.key];
        const helpedFirst = bar.helped && !BARS[index - 1]?.helped;
        return (
          <div
            className="so-far-bar"
            key={bar.key}
            data-key={bar.key}
            data-helped={bar.helped ? "" : undefined}
            data-helped-first={helpedFirst ? "" : undefined}
            data-zero={value === 0 ? "" : undefined}
            {...grewAttrs(growth, run)}
          >
            <div className="so-far-track">
              {value > 0 && (
                <i
                  className="so-far-fill"
                  data-grew={run && growth.grew ? "" : undefined}
                  style={css({ "--ratio": value / max, "--from": growth.from / value })}
                />
              )}
            </div>
            {value === 0 ? (
              <strong className="so-far-later">これから</strong>
            ) : (
              <strong>
                <CountUp growth={growth} run={run} />
              </strong>
            )}
            <small>{bar.label}</small>
          </div>
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
  const fresh = new Set(run && plan.days.grew ? story.reachedDays.slice(plan.days.from) : []);
  const freshList = [...fresh];
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

/** つながりの線。真ん中が自分で、線は人へ届く。新しくつながった人の線だけ伸びる */
function PanelPeople({ story, plan, rewards, run }: { story: Story; plan: StoryPlan; rewards: boolean; run: boolean }) {
  const people = story.people;
  if (people.length === 0) return <p className="so-far-later so-far-center">これから</p>;
  return (
    <div className="so-far-web">
      {people.map((person, index) => {
        const angle = (360 / people.length) * index - 90;
        const rad = (angle * Math.PI) / 180;
        const fresh = run && plan.newPeople.has(person.id);
        return (
          <span key={person.id} data-grew={fresh ? "" : undefined} data-person={person.id}>
            <i className="so-far-line" data-fresh={fresh ? "" : undefined} style={css({ "--angle": `${angle}deg` })} />
            <span
              className="so-far-person"
              data-fresh={fresh ? "" : undefined}
              style={css({ left: `${50 + 38 * Math.cos(rad)}%`, top: `${50 + 38 * Math.sin(rad)}%` })}
            >
              {person.name}
            </span>
          </span>
        );
      })}
      <span className="so-far-me">
        {rewards && story.family ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={story.image} alt="あなた" width={40} height={40} />
        ) : (
          "あなた"
        )}
      </span>
      {story.morePeople > 0 && <p className="so-far-more-people">ほか {story.morePeople} 人</p>}
    </div>
  );
}

/** 桜とパートナー（パートナーを隠しているときは、葉の数とトロフィーを文字だけで） */
function PanelTree({ story, plan, rewards, run }: { story: Story; plan: StoryPlan; rewards: boolean; run: boolean }) {
  const flying = Math.min(8, story.leaves);
  const already = run && plan.leaves.grew ? Math.min(8, plan.leaves.from) : flying;
  const label = (
    <p className="so-far-leaves" {...grewAttrs(plan.leaves, run)}>
      葉 <CountUp growth={plan.leaves} run={run} />枚
    </p>
  );
  if (!rewards) {
    return (
      <div className="so-far-tree-text">
        {label}
        {story.trophies.length > 0 && (
          <ul className="so-far-trophies">
            {story.trophies.slice(0, 3).map((name) => (
              <li key={name}>{name}</li>
            ))}
            {story.trophies.length > 3 && <li>ほか {story.trophies.length - 3}</li>}
          </ul>
        )}
      </div>
    );
  }
  const gap = flying > already ? GROW_MS / (flying - already) : 0;
  return (
    <div className="so-far-tree">
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
      {label}
      {story.stageImages.length > 0 && (
        <div className="so-far-stages">
          {story.stageImages.map((image, index) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={image}
              src={image}
              alt={index === story.stageImages.length - 1 ? "今のパートナー" : ""}
              width={36}
              height={36}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** 一言。人の言葉で閉じる（AI の褒め言葉は出さない） */
function PanelWords({ story, plan, run }: { story: Story; plan: StoryPlan; run: boolean }) {
  if (story.words.length === 0) return <p className="so-far-later so-far-center">これからもらう一言が、ここに並びます。</p>;
  return (
    <ul className="so-far-words" data-grew={run && plan.words.grew ? "" : undefined}>
      {story.words.map((word, index) => (
        <li key={index}>
          「{word.text}」<small>{word.from}さん</small>
        </li>
      ))}
    </ul>
  );
}

/** データ0の人：届いた日・つながり・桜の代わりの「はじまりの日」 */
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

function Panel({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="so-far-panel" data-panel={id} aria-label={title}>
      <h2>{title}</h2>
      <div className="so-far-panel-body">{children}</div>
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

  const since = story.firstDate ?? story.today;
  return (
    <div className="so-far-board" data-reduced={reduced ? "" : undefined} data-settled={settled ? "" : undefined}>
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
        <Panel id="bars" title="積み上がり">
          <PanelBars story={story} plan={plan} run={run} />
        </Panel>
        {story.empty ? (
          <Panel id="first" title="はじまりの日">
            <PanelFirstDay story={story} rewards={rewards} />
          </Panel>
        ) : (
          <>
            <Panel id="days" title="届いた日">
              <PanelDays story={story} plan={plan} run={run} />
            </Panel>
            <Panel id="people" title="つながり">
              <PanelPeople story={story} plan={plan} rewards={rewards} run={run} />
            </Panel>
            <Panel id="tree" title={rewards ? "桜とパートナー" : "葉とトロフィー"}>
              <PanelTree story={story} plan={plan} rewards={rewards} run={run} />
            </Panel>
          </>
        )}
        <Panel id="words" title="一言">
          <PanelWords story={story} plan={plan} run={run} />
        </Panel>
      </div>
    </div>
  );
}

/**
 * 0-2t：帯を押すと開く「これまで」のインフォグラフィック。全部のグラフを1画面に並べ、スクロールさせない。
 * 開いた瞬間、前に見たときから増えた項目だけが前の値から同時に伸び、数字も数え上がる。増えていない項目は今の値のまま。
 * 前に見た値は端末ごと（localStorage）。動きを減らす設定では動かさない。動かすのは transform と opacity だけ。
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
