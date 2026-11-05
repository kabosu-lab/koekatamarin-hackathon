import { Icon } from "./Icon";
import { listAlertsFor } from "@/lib/safety";
import { isTrialMode } from "@/lib/trial";
import { counselorId } from "@/lib/seed-data";
import { cookies } from "next/headers";
import Link from "next/link";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { syncFromTeamsIfStale } from "@/lib/destination/teams-bridge";
import { dailyQuestion } from "@/lib/daily-question";
import { getGoal, goalQuestion } from "@/lib/goals";
import { readAppearance } from "@/lib/appearance";
import { countForNotice } from "@/lib/inbox";
import { countKnowledgeForNotice } from "@/lib/knowledge";
import { promiseCookieName } from "@/lib/promise-cookie";
import { listReplyNotices } from "@/lib/reply-notices";
import { ReplyNoticeCard } from "./ReplyNoticeCard";
import { RibbonMoment } from "./RibbonMoment";
import { listGiftEggs, syncGiftEggs } from "@/lib/gift-eggs";
import { listNewRibbons, syncRibbons } from "@/lib/ribbons";
import { showsRewards } from "@/lib/rewards-view";
import { Talk } from "./Talk";

export const dynamic = "force-dynamic";

const SEND_PROMPT = "届けたいことを話してね。下書きにするよ。送るのは、確かめてから。";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ ask?: string | string[]; goal?: string | string[]; talk?: string | string[] }> }) {
  const { ask, goal, talk } = await searchParams;
  const { viewer, people } = await getViewer();
  const db = getDatabase();
  await syncFromTeamsIfStale(db);
  const waiting = countForNotice(db, viewer.id, new Date());
  const knowledgeTasks = countKnowledgeForNotice(db, viewer.id, new Date());
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
  syncRibbons(db, viewer.id, new Date());
  syncGiftEggs(db, viewer.id, new Date());
  const eggs = rewards ? listGiftEggs(db, viewer.id).length : 0;
  const hasAlerts = !isTrialMode() && viewer.role !== "student" && (viewer.id === counselorId || listAlertsFor(db, viewer.id).length > 0);
  const quickLinks = (
    <nav className="quick-links" aria-label="届いているもの">
      {eggs > 0 && (
        <Link href="/me">
          <Icon name="gift" />
          贈り物の卵が届いています
        </Link>
      )}
      {(waiting > 0 || knowledgeTasks > 0) && (
        <Link href="/inbox">
          <Icon name="inbox" />
          受信箱
          {waiting > 0 && `（お願いが ${waiting} 件）`}
          {knowledgeTasks > 0 && `（知恵の確認が ${knowledgeTasks} 件）`}
        </Link>
      )}
      {hasAlerts && (
        <Link href="/soudan">
          <Icon name="shield" />
          相談室への知らせを見る
        </Link>
      )}
    </nav>
  );
  const replyNotice = <ReplyNoticeCard notices={listReplyNotices(db, viewer.id)} />;
  const question = goalQuestion(db, viewer.id, new Date()) ?? dailyQuestion(new Date());

  // 全員同じ1画面。ほかの画面へはスワイプと、下の小さな印から移る
  return (
    <main className="retro-home">
      <h1 className="visually-hidden">こえかた</h1>
      {rewards && <RibbonMoment key={`ribbon-${viewer.id}`} ribbons={listNewRibbons(db, viewer.id)} />}
      {replyNotice}
      {quickLinks}
      <Talk
        key={viewer.id}
        device
        viewer={{ name: viewer.name, label: viewer.label }}
        viewerId={viewer.id}
        promiseSeen={promiseSeen}
        companionAlt={rewards ? `${viewer.name}さんの相棒` : undefined}
        question={talk === "send" ? SEND_PROMPT : question}
        initialGoal={doneGoal?.status === "done" ? { id: doneGoal.id, text: doneGoal.text } : null}
        initialAsk={askPerson ? { id: askPerson.id, name: askPerson.name } : null}
      />
    </main>
  );
}
