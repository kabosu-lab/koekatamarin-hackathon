import { Icon } from "./Icon";
import { listAlertsFor } from "@/lib/safety";
import { isTrialMode } from "@/lib/trial";
import { counselorId } from "@/lib/seed-data";
import { cookies } from "next/headers";
import Link from "next/link";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { getAvatar } from "@/lib/avatar";
import { dailyQuestion } from "@/lib/daily-question";
import { getGoal, goalQuestion } from "@/lib/goals";
import { readAppearance } from "@/lib/appearance";
import { countForNotice } from "@/lib/inbox";
import { countKnowledgeForNotice } from "@/lib/knowledge";
import { promiseCookieName } from "@/lib/promise-cookie";
import { listReplyNotices } from "@/lib/reply-notices";
import { HomeAside } from "./HomeAside";
import { ReplyNoticeCard } from "./ReplyNoticeCard";
import { RibbonMoment } from "./RibbonMoment";
import { listGiftEggs, syncGiftEggs } from "@/lib/gift-eggs";
import { listNewRibbons, syncRibbons } from "@/lib/ribbons";
import { showsRewards } from "@/lib/rewards-view";
import { pixelStageFor } from "@/lib/pixel-companion";
import { setAppearance } from "./person-actions";
import { PixelCompanion } from "./PixelCompanion";
import { Talk } from "./Talk";

export const dynamic = "force-dynamic";

const SEND_PROMPT = "届けたいことを話してね。下書きにするよ。送るのは、確かめてから。";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ ask?: string | string[]; goal?: string | string[]; talk?: string | string[] }> }) {
  const { ask, goal, talk } = await searchParams;
  const { viewer, people } = await getViewer();
  const db = getDatabase();
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
  const appearance = readAppearance((name) => store.get(name)?.value, viewer.role);
  const soundOn = appearance.sound === "on";
  const rewards = showsRewards(appearance);
  const isModern = appearance.theme === "modern";
  const isRetro = appearance.theme === "retro";
  syncRibbons(db, viewer.id, new Date());
  syncGiftEggs(db, viewer.id, new Date());
  const eggs = rewards ? listGiftEggs(db, viewer.id).length : 0;
  const hasAlerts = !isTrialMode() && viewer.role !== "student" && (viewer.id === counselorId || listAlertsFor(db, viewer.id).length > 0);
  const avatar = getAvatar(db, viewer.id);
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
  const pixelStage = pixelStageFor(avatar.family, avatar.stage);

  // レトロは液晶とホイールの配置。ほかの画面へはスワイプと下のナビで移る
  if (isRetro) {
    return (
      <main className="retro-home">
        <h1 className="device-logo">こえかた</h1>
        {rewards && <RibbonMoment key={`ribbon-${viewer.id}`} ribbons={listNewRibbons(db, viewer.id)} />}
        {replyNotice}
        {quickLinks}
        <Talk
          key={viewer.id}
          device
          viewer={{ name: viewer.name, label: viewer.label }}
          viewerId={viewer.id}
          promiseSeen={promiseSeen}
          companion={rewards ? <PixelCompanion stage={pixelStage} branch={avatar.family} alt={`${viewer.name}さんの相棒`} size={200} /> : undefined}
          question={talk === "send" ? SEND_PROMPT : question}
          initialGoal={doneGoal?.status === "done" ? { id: doneGoal.id, text: doneGoal.text } : null}
          initialAsk={askPerson ? { id: askPerson.id, name: askPerson.name } : null}
        />
      </main>
    );
  }

  return (
    <main className="home stage-home">
      {rewards && <RibbonMoment key={`ribbon-${viewer.id}`} ribbons={listNewRibbons(db, viewer.id)} />}
      <header className="hero">
        <h1>こえかた</h1>
        <p>話すだけで、できることが増える。</p>
        <details className="home-settings">
          <summary>
            <Icon name="settings" />
            設定
          </summary>
          <div className="home-settings-menu">
            <form action={setAppearance}>
              <input type="hidden" name="name" value="sound" />
              <button type="submit" name="value" value={soundOn ? "off" : "on"} aria-pressed={soundOn}>
                <Icon name={soundOn ? "soundOn" : "soundOff"} />
                音 {soundOn ? "オン" : "オフ"}
              </button>
            </form>
            <form action={setAppearance}>
              <input type="hidden" name="name" value="theme" />
              <button type="submit" name="value" value={isModern ? "pop" : "modern"}>
                <Icon name="star" />
                {isModern ? "ポップに" : "モダンに"}
              </button>
            </form>
            <Link href="/me#settings">そのほかの設定</Link>
          </div>
        </details>
      </header>
      {replyNotice}
      {/* Claude との話は本人だけのもの。人物を切り替えたら会話を持ち越さない */}
      {quickLinks}
      <Talk
        key={viewer.id}
        viewer={{ name: viewer.name, label: viewer.label }}
        viewerId={viewer.id}
        promiseSeen={promiseSeen}
        avatarImage={rewards ? avatar.image : undefined}
        question={talk === "send" ? SEND_PROMPT : question}
        initialGoal={doneGoal?.status === "done" ? { id: doneGoal.id, text: doneGoal.text } : null}
        initialAsk={askPerson ? { id: askPerson.id, name: askPerson.name } : null}
      />
      <HomeAside db={db} viewerId={viewer.id} rewards={rewards} />
    </main>
  );
}
