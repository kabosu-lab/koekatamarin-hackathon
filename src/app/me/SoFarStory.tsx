"use client";

import Link from "next/link";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import type { SoFarStory as Story } from "@/lib/so-far";
import { BottomSheet } from "../BottomSheet";
import { playCommitPop, playReachedSound } from "../sound";
import "./so-far-story.css";

/** 場面ごとの長さ（ms）。合わせて約12秒。押せばいつでも次へ */
const SCENE_MS: Record<SceneId, number> = {
  "1": 1000,
  "2": 2800,
  "3": 2000,
  "4": 2500,
  "5": 2500,
  "6": 1000,
  start: 4000,
};
type SceneId = "1" | "2" | "3" | "4" | "5" | "6" | "start";

const BAR_CELLS = 12;
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

/** 時刻の予定。場面が変わる・閉じるときにまとめて止める */
function useTimers() {
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);
  return (ms: number, run: () => void) => {
    timers.current.push(window.setTimeout(run, ms));
  };
}

function Egg() {
  return (
    <svg className="so-far-egg" viewBox="0 0 40 50" aria-hidden="true">
      <path d="M20 2C9 2 2 20 2 31a18 18 0 0 0 36 0C38 20 31 2 20 2Z" />
    </svg>
  );
}

/** ① はじまり */
function SceneStart({ story, rewards }: { story: Story; rewards: boolean }) {
  return (
    <div className="so-far-begin">
      <p className="so-far-big so-far-rise">{story.firstDate ? `${monthDay(story.firstDate)} から` : `${monthDay(story.today)} から`}</p>
      {rewards && story.stageImages.length > 0 && (
        <div className="so-far-path">
          <Egg />
          <span className="so-far-dash" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={story.image} alt="今のパートナー" width={64} height={64} className="so-far-pop" />
        </div>
      )}
    </div>
  );
}

/** ② 積み上がる棒。1マス＝1回、ポンが1段ずつ上がる */
function SceneBars({ story, reduced }: { story: Story; reduced: boolean }) {
  const later = useTimers();
  const cells = BARS.map((bar) => Math.min(BAR_CELLS, story.counts[bar.key]));
  const total = cells.reduce((sum, n) => sum + n, 0);
  // 多い人でも2.4秒で積み終わるよう、1マスの間隔を詰める（70ms が上限）
  const interval = total > 0 ? Math.min(70, 2400 / total) : 70;
  const starts = cells.map((_, index) => cells.slice(0, index).reduce((sum, n) => sum + n, 0));

  useEffect(() => {
    if (reduced) return;
    for (let i = 0; i < total; i++) later(i * interval + 120, () => playCommitPop(Math.min(i + 1, MAX_POP_STEP)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="so-far-bars">
      {BARS.map((bar, index) => {
        const count = story.counts[bar.key];
        return (
          <div className="so-far-bar" key={bar.key} data-helped={bar.helped ? "" : undefined}>
            <div className="so-far-cells">
              {Array.from({ length: cells[index] }, (_, cell) => (
                <i
                  key={cell}
                  style={css({
                    "--at": `${(starts[index] + cell) * interval}ms`,
                  })}
                />
              ))}
            </div>
            <strong data-zero={count === 0 ? "" : undefined}>{count === 0 ? "これから" : count}</strong>
            <small>{bar.label}</small>
          </div>
        );
      })}
    </div>
  );
}

/** ③ 届けた日の点。学期の週×曜日の升に、届いた日だけが灯る */
function SceneDays({ story, reduced }: { story: Story; reduced: boolean }) {
  const later = useTimers();
  const end = new Date(`${story.today}T00:00:00Z`);
  let start = new Date(`${story.termStart}T00:00:00Z`);
  if (story.few) start = new Date(end.getTime() - 27 * 86_400_000);
  // 週の頭（月曜）にそろえる
  start = new Date(start.getTime() - ((start.getUTCDay() + 6) % 7) * 86_400_000);
  const days: string[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += 86_400_000) days.push(new Date(t).toISOString().slice(0, 10));
  const reached = new Set(story.reachedDays);
  const study = new Set(story.studyDays);
  const lit = days.filter((day) => reached.has(day) || study.has(day));
  const gap = lit.length > 0 ? Math.min(40, 1400 / lit.length) : 40;
  const count = story.reachedDays.filter((day) => day >= days[0]).length;

  useEffect(() => {
    if (!reduced) later(lit.length * gap + 200, () => playReachedSound());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="so-far-days-wrap">
      <div className="so-far-days" style={css({ "--weeks": Math.ceil(days.length / 7) })}>
        {days.map((day) => {
          const order = lit.indexOf(day);
          return (
            <i
              key={day}
              data-reached={reached.has(day) ? "" : undefined}
              data-study={!reached.has(day) && study.has(day) ? "" : undefined}
              style={order >= 0 ? css({ "--at": `${order * gap}ms` }) : undefined}
            />
          );
        })}
      </div>
      <p className="so-far-rise so-far-after" style={css({ "--at": `${lit.length * gap}ms` })}>
        {count}日、人に届いた
        {story.studyDays.length > 0 && <small>　うすい点は、一緒に勉強した日</small>}
      </p>
    </div>
  );
}

/** ④ つながりの線。真ん中が自分で、線は人へ届く（矢印は付けない） */
function ScenePeople({ story, rewards, reduced }: { story: Story; rewards: boolean; reduced: boolean }) {
  const later = useTimers();
  const people = story.people;
  const step = people.length > 0 ? Math.min(220, 1800 / people.length) : 0;

  useEffect(() => {
    if (reduced) return;
    people.slice(0, 4).forEach((_, index) => later(200 + index * step + 260, () => playReachedSound()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="so-far-web">
      {people.map((person, index) => {
        const angle = (360 / people.length) * index - 90;
        const rad = (angle * Math.PI) / 180;
        const at = 200 + index * step;
        return (
          <span key={person.id}>
            <i className="so-far-line" style={css({ "--angle": `${angle}deg`, "--at": `${at}ms` })} />
            <span
              className="so-far-person"
              style={css({
                left: `${50 + 38 * Math.cos(rad)}%`,
                top: `${50 + 38 * Math.sin(rad)}%`,
                "--at": `${at + 260}ms`,
              })}
            >
              {person.name}
            </span>
          </span>
        );
      })}
      <span className="so-far-me">
        {rewards && story.family ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={story.image} alt="あなた" width={56} height={56} />
        ) : (
          "あなた"
        )}
      </span>
      {story.morePeople > 0 && <p className="so-far-more-people">ほか {story.morePeople} 人</p>}
    </div>
  );
}

/** ⑤ 桜とパートナー（モダンでは文字だけ） */
function SceneTree({ story, rewards, reduced }: { story: Story; rewards: boolean; reduced: boolean }) {
  const later = useTimers();
  const flying = Math.min(8, story.leaves);

  useEffect(() => {
    if (!reduced && rewards && flying > 0) later(flying * 120 + 600, () => playReachedSound());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!rewards) {
    return (
      <div className="so-far-tree-text">
        <p className="so-far-big so-far-rise">葉 {story.leaves}枚</p>
        {story.trophies.length > 0 && (
          <ul className="so-far-trophies">
            {story.trophies.map((name, index) => (
              <li key={name} className="so-far-rise" style={css({ "--at": `${200 + index * 120}ms` })}>
                {name}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  return (
    <div className="so-far-tree">
      <svg className="so-far-branch" viewBox="0 0 320 90" aria-hidden="true">
        <path d="M0 70 C80 60 160 40 320 30" />
        {Array.from({ length: flying }, (_, index) => {
          const x = 30 + index * 36;
          const y = 66 - index * 4.4;
          return (
            <ellipse
              key={index}
              className="so-far-leaf"
              cx={x}
              cy={y - 10}
              rx="9"
              ry="5"

              style={css({ "--at": `${index * 120}ms` })}
            />
          );
        })}
      </svg>
      <p className="so-far-rise" style={css({ "--at": `${flying * 120}ms` })}>
        葉 {story.leaves}枚{story.leaves > flying && `（+${story.leaves - flying}）`}
      </p>
      {story.stageImages.length > 0 && (
        <div className="so-far-stages">
          {story.stageImages.map((image, index) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={image}
              src={image}
              alt={index === story.stageImages.length - 1 ? "今のパートナー" : ""}
              width={48}
              height={48}
              className={index === story.stageImages.length - 1 ? "so-far-pop" : "so-far-rise"}
              style={css({ "--at": `${900 + index * 160}ms` })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** ⑥ 一言。人の言葉で閉じる（AI の褒め言葉は出さない）。音なし */
function SceneWords({ story }: { story: Story }) {
  if (story.words.length === 0) return <p className="so-far-rise">これからもらう一言が、ここに並びます。</p>;
  return (
    <ul className="so-far-words">
      {story.words.map((word, index) => (
        <li key={index} className="so-far-rise" style={css({ "--at": `${index * 160}ms` })}>
          「{word.text}」<small>{word.from}さん</small>
        </li>
      ))}
    </ul>
  );
}

/** データ0の人：②〜⑤の代わりの「はじまりの日」 */
function SceneFirstDay({ story, rewards }: { story: Story; rewards: boolean }) {
  return (
    <div className="so-far-first">
      <p className="so-far-big so-far-rise">{monthDay(story.today)}</p>
      {rewards && (
        <div className="so-far-path">
          <Egg />
          <svg className="so-far-branch" viewBox="0 0 200 60" aria-hidden="true">
            <path d="M0 50 C60 44 120 30 200 24" />
            <circle className="so-far-empty-leaf" cx="120" cy="22" r="7" />
          </svg>
        </div>
      )}
      <p className="so-far-rise" style={css({ "--at": "400ms" })}>
        今日の一言が、最初の葉になる
      </p>
    </div>
  );
}

const TITLES: Record<SceneId, string> = {
  "1": "はじまり",
  "2": "積み上がり",
  "3": "届いた日",
  "4": "つながり",
  "5": "桜とパートナー",
  "6": "一言",
  start: "はじまりの日",
};

function Scene({ id, story, rewards, reduced }: { id: SceneId; story: Story; rewards: boolean; reduced: boolean }) {
  switch (id) {
    case "1":
      return <SceneStart story={story} rewards={rewards} />;
    case "2":
      return <SceneBars story={story} reduced={reduced} />;
    case "3":
      return <SceneDays story={story} reduced={reduced} />;
    case "4":
      return <ScenePeople story={story} rewards={rewards} reduced={reduced} />;
    case "5":
      return <SceneTree story={story} rewards={rewards} reduced={reduced} />;
    case "6":
      return <SceneWords story={story} />;
    default:
      return <SceneFirstDay story={story} rewards={rewards} />;
  }
}

/**
 * 0-2b 第3段：帯を押すと開く「これまで」のインフォグラフィック。
 * 約12秒で6つの場面が順に描かれる。どこを押しても次へ、下へなでると閉じる。動かすのは transform と opacity だけ。
 * 動きを減らす設定では、全部の場面を静止で縦に並べる。
 */
export function SoFarStory({ open, onClose, story, rewards }: { open: boolean; onClose: () => void; story: Story; rewards: boolean }) {
  const scenes: SceneId[] = story.empty ? ["1", "start", "6"] : ["1", "2", "3", "4", "5", "6"];
  const [index, setIndex] = useState(0);
  const [reduced, setReduced] = useState(false);
  const last = index === scenes.length - 1;
  const current = scenes[index];

  useEffect(() => {
    if (!open) return;
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 開いた瞬間に最初の場面から
    setIndex(0);
    setReduced(calm);
    // 動きを減らす設定でも、積み上がったことは音で1回だけ伝える
    if (calm && !story.empty) playCommitPop(MAX_POP_STEP);
  }, [open, story.empty]);

  // 時間が来たら次の場面へ。最後の場面で止まる
  useEffect(() => {
    if (!open || reduced || last) return;
    const timer = window.setTimeout(() => setIndex((i) => Math.min(i + 1, scenes.length - 1)), SCENE_MS[current]);
    return () => window.clearTimeout(timer);
  }, [open, reduced, last, current, scenes.length]);

  return (
    <div className="so-far-story" data-reduced={reduced ? "" : undefined}>
      <BottomSheet
        open={open}
        onClose={onClose}
        label="これまで"
        footer={
          (last || reduced) && (
            <div className="so-far-actions">
              <Link href="/me?open=lookback" className="so-far-read">
                ふりかえりを読む
              </Link>
              <button type="button" className="secondary" onClick={onClose}>
                閉じる
              </button>
            </div>
          )
        }
      >
        {open &&
          (reduced ? (
            <div className="so-far-still">
              {scenes.map((id) => (
                <section key={id} className="so-far-scene" data-scene={id} aria-label={TITLES[id]}>
                  <h2>{TITLES[id] === "桜とパートナー" && !rewards ? "葉とトロフィー" : TITLES[id]}</h2>
                  <Scene id={id} story={story} rewards={rewards} reduced />
                </section>
              ))}
            </div>
          ) : (
            <section
              key={current}
              className="so-far-scene"
              data-scene={current}
              aria-label={TITLES[current]}
              aria-live="polite"
              onClick={() => !last && setIndex((i) => Math.min(i + 1, scenes.length - 1))}
            >
              <h2 className="so-far-rise">{current === "5" && !rewards ? "葉とトロフィー" : TITLES[current]}</h2>
              <Scene id={current} story={story} rewards={rewards} reduced={false} />
              {!last && <p className="so-far-hint">押すと次へ</p>}
            </section>
          ))}
      </BottomSheet>
    </div>
  );
}
