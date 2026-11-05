import { cookies } from "next/headers";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { getAvatar } from "@/lib/avatar";
import { lumpLookOf } from "@/lib/avatar-art";
import { companionColor } from "@/lib/companion-art";
import { syncFromTeamsIfStale, teamsSyncMs } from "@/lib/destination/teams-bridge";
import { dailyQuestion } from "@/lib/daily-question";
import { getGoal, goalQuestion } from "@/lib/goals";
import { readAppearance } from "@/lib/appearance";
import { promiseCookieName } from "@/lib/promise-cookie";
import { listReplyNotices } from "@/lib/reply-notices";
import { RibbonMoment } from "./RibbonMoment";
import { isNoticeHours } from "@/lib/inbox";
import { syncGiftEggs } from "@/lib/gift-eggs";
import { listNewRibbons, syncRibbons } from "@/lib/ribbons";
import { showsRewards } from "@/lib/rewards-view";
import { Talk } from "./Talk";
import { WidePanel } from "./WidePanels";

export const dynamic = "force-dynamic";

const SEND_PROMPT = "届けたいことを話してね。下書きにするよ。送るのは、確かめてから。";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ ask?: string | string[]; goal?: string | string[]; talk?: string | string[] }> }) {
  const { ask, goal, talk } = await searchParams;
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
  const doneGoal = typeof goal === "string" ? getGoal(db, viewer.id, goal) : null;
  const store = await cookies();
  const promiseSeen = store.has(promiseCookieName(viewer.id));
  const appearance = readAppearance((name) => store.get(name)?.value);
  const rewards = showsRewards(appearance);
  const avatar = getAvatar(db, viewer.id);
  const look = lumpLookOf(db, viewer.id);
  syncRibbons(db, viewer.id, new Date());
  syncGiftEggs(db, viewer.id, new Date());
  syncGiftEggs(db, viewer.id, new Date());
  const question = goalQuestion(db, viewer.id, new Date()) ?? dailyQuestion(new Date());

  // 全員同じ1画面。ほかの画面へはスワイプと、下の小さな印から移る
  return (
    <div className="device-row">
    <WidePanel src="/me" title="履歴と設定" />
    <main className="retro-home">
      <h1 className="visually-hidden">こえかた</h1>
      {rewards && <RibbonMoment key={`ribbon-${viewer.id}`} ribbons={listNewRibbons(db, viewer.id)} />}
      <Talk
        key={viewer.id}
        device
        noticePollMs={teamsSyncMs()}
        notices={isNoticeHours(new Date()) ? listReplyNotices(db, viewer.id) : []}
        viewer={{ name: viewer.name, label: viewer.label }}
        viewerId={viewer.id}
        promiseSeen={promiseSeen}
        companionAlt={rewards ? `${viewer.name}さんの相棒` : undefined}
        companionColor={look.color ?? companionColor(avatar.family)}
        companionShape={look.shape}
        companionImage={avatar.stage >= 2 ? avatar.image : undefined}
        question={talk === "send" ? SEND_PROMPT : question}
        initialGoal={doneGoal?.status === "done" ? { id: doneGoal.id, text: doneGoal.text } : null}
        initialAsk={askPerson ? { id: askPerson.id, name: askPerson.name } : null}
      />
    </main>
    <WidePanel src="/minna" title="みんな" />
    </div>
  );
}
