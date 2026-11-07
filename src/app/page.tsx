import { cookies } from "next/headers";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { getAvatar } from "@/lib/avatar";
import { lumpLookOf } from "@/lib/avatar-art";
import { companionColor } from "@/lib/companion-art";
import { syncFromTeamsIfStale } from "@/lib/destination/teams-bridge";
import { dailyQuestion } from "@/lib/daily-question";
import { getGoal, goalQuestion } from "@/lib/goals";
import { readAppearance } from "@/lib/appearance";
import { promiseCookieName } from "@/lib/promise-cookie";
import { RibbonMoment } from "./RibbonMoment";
import { countNew, newsLine, sideCounts } from "@/lib/new-counts";
import { getDestination } from "@/lib/destination/current";
import { TODAY_SEEN_COOKIE } from "./minna/today-seen";
import { syncGiftEggs } from "@/lib/gift-eggs";
import { listNewRibbons, syncRibbonsOnOpen } from "@/lib/ribbons";
import { showsRewards } from "@/lib/rewards-view";
import { thanksDeviceCookie } from "@/lib/thanks-kind";
import { ensureWelcomeThanks, listRevealThanks } from "@/lib/thanks-reveal";
import { Talk } from "./Talk";
import { ThanksReveal } from "./thanks/ThanksReveal";
import { DeviceRow, WidePanel } from "./WidePanels";
import { columnSrc } from "@/lib/wide";

export const dynamic = "force-dynamic";

const SEND_PROMPT = "届けたいことを話してね。下書きにするよ。送るのは、確かめてから。";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ ask?: string | string[]; goal?: string | string[]; talk?: string | string[]; left?: string | string[]; right?: string | string[]; pane?: string | string[]; thanks?: string | string[] }> }) {
  const { ask, goal, talk, left, right, pane, thanks } = await searchParams;
  // 0-2z：狭い画面の帯で、左右どちらの画面にいるか（?pane=right / ?pane=left）。再読み込みや「戻る」でも同じ画面を描く
  const shownPane = pane === "right" || pane === "left" ? pane : undefined;
  const { viewer, people } = await getViewer();
  const db = getDatabase();
  await syncFromTeamsIfStale(db);
  // 知恵の画面から「聞いてみる？」で来たときの相手
  // 生徒に生徒を紹介しないので、生徒から生徒へは名指しの相手にしない
  const isStudent = (id: string) => (db.prepare("SELECT role FROM people WHERE id = ?").get(id) as { role: string } | undefined)?.role === "student";
  const askPerson =
    typeof ask === "string" && ask !== viewer.id && !(isStudent(viewer.id) && isStudent(ask))
      ? people.find((person) => person.id === ask)
      : undefined;
  // 0-3d：「ありがとう」ボタンから来たときの相手。話す画面でその人へのカードの下書きを始める
  const thanksPerson = typeof thanks === "string" && thanks !== viewer.id ? people.find((person) => person.id === thanks) : undefined;
  const doneGoal = typeof goal === "string" ? getGoal(db, viewer.id, goal) : null;
  const store = await cookies();
  const promiseSeen = store.has(promiseCookieName(viewer.id));
  const appearance = readAppearance((name) => store.get(name)?.value);
  const rewards = showsRewards(appearance);
  const avatar = getAvatar(db, viewer.id);
  const look = lumpLookOf(db, viewer.id);
  syncRibbonsOnOpen(db, viewer.id, new Date());
  syncGiftEggs(db, viewer.id, new Date());
  // 0-3a：試用でも審査でも届く演出を体験できるよう、ダミーの同僚から今日の1枚を入れておく
  ensureWelcomeThanks(db, viewer.id, new Date());
  const question = goalQuestion(db, viewer.id, new Date()) ?? dailyQuestion(new Date());
  // 0-2v：新着の数（みんな・履歴と設定・ホイールと同じ数え方）。知恵や頑張りから来たときは、その話を先にする
  const counts = countNew(db, getDestination(db), viewer.id, new Date(), { rewards, todaySeen: store.has(TODAY_SEEN_COOKIE) });
  // 0-3a：封筒の知らせは、この端末でまだ開けていないカードがあるときだけ（数とバッジは人物ごとのまま）
  const revealCards = listRevealThanks(db, viewer.id, store.get(thanksDeviceCookie(viewer.id))?.value ?? null, new Date());
  const news = ask || goal || talk || thanksPerson ? null : newsLine({ ...counts, thanks: revealCards.length }, viewer.role);

  // 全員同じ1画面。ほかの画面へはスワイプと、下の小さな印から移る
  return (
    <DeviceRow pane={shownPane}>
    {/* 0-2y：広い画面の左右の列。奥の画面を直接開いたときは ?left= / ?right= でその列の中に開く */}
    <WidePanel src={columnSrc("left", left)} title="履歴と設定" side="left" shown={shownPane === "left"} />
    <main className="retro-home">
      <h1 className="visually-hidden">こえかた</h1>
      {rewards && <RibbonMoment key={`ribbon-${viewer.id}`} ribbons={listNewRibbons(db, viewer.id)} hold={revealCards.length > 0} />}
      <ThanksReveal key={`thanks-${viewer.id}`} viewerId={viewer.id} cards={revealCards} />
      <Talk
        key={viewer.id}
        device
        news={news}
        newCounts={{ ...sideCounts(counts), inbox: counts.inbox, today: counts.today }}
        viewer={{ name: viewer.name, label: viewer.label, role: viewer.role }}
        viewerId={viewer.id}
        promiseSeen={promiseSeen}
        companionAlt={rewards ? `${viewer.name}さんのパートナー` : undefined}
        companionColor={look.color ?? companionColor(avatar.family)}
        companionShape={look.shape}
        companionImage={avatar.stage >= 2 ? avatar.image : undefined}
        question={talk === "send" ? SEND_PROMPT : question}
        initialGoal={doneGoal?.status === "done" ? { id: doneGoal.id, text: doneGoal.text } : null}
        initialAsk={askPerson ? { id: askPerson.id, name: askPerson.name } : null}
        initialThanks={thanksPerson ? { id: thanksPerson.id, name: thanksPerson.name } : null}
      />
    </main>
    <WidePanel src={columnSrc("right", right)} title="みんな" side="right" shown={shownPane === "right"} />
    </DeviceRow>
  );
}
