import { cookies } from "next/headers";
import Link from "next/link";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { getAvatar } from "@/lib/avatar";
import { dailyQuestion } from "@/lib/daily-question";
import { readAppearance } from "@/lib/appearance";
import { countForNotice } from "@/lib/inbox";
import { countKnowledgeForNotice } from "@/lib/knowledge";
import { promiseCookieName } from "@/lib/promise-cookie";
import { HomeAside } from "./HomeAside";
import { RibbonMoment } from "./RibbonMoment";
import { listGiftEggs, syncGiftEggs } from "@/lib/gift-eggs";
import { listNewRibbons, syncRibbons } from "@/lib/ribbons";
import { showsRewards } from "@/lib/rewards-view";
import { setAppearance } from "./person-actions";
import { PersonSwitcher } from "./PersonSwitcher";
import { Talk } from "./Talk";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ ask?: string | string[] }> }) {
  const { ask } = await searchParams;
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
  const store = await cookies();
  const promiseSeen = store.has(promiseCookieName(viewer.id));
  const appearance = readAppearance((name) => store.get(name)?.value);
  const soundOn = appearance.sound === "on";
  const rewards = showsRewards(appearance);
  const isModern = appearance.theme === "modern";
  syncRibbons(db, viewer.id, new Date());
  syncGiftEggs(db, viewer.id, new Date());
  const eggs = rewards ? listGiftEggs(db, viewer.id).length : 0;
  return (
    <main className="home stage-home">
      {rewards && <RibbonMoment key={viewer.id} ribbons={listNewRibbons(db, viewer.id)} />}
      <header className="hero">
        <h1>こえかた</h1>
        <p>話すだけで、できることが増える。</p>
        <form className="sound-toggle" action={setAppearance}>
          <input type="hidden" name="name" value="sound" />
          <button type="submit" name="value" value={soundOn ? "off" : "on"} aria-pressed={soundOn}>
            音 {soundOn ? "オン" : "オフ"}
          </button>
        </form>
        <form className="theme-toggle" action={setAppearance}>
          <input type="hidden" name="name" value="theme" />
          <button type="submit" name="value" value={isModern ? "pop" : "modern"}>
            {isModern ? "ポップに" : "モダンに"}
          </button>
        </form>
      </header>
      <PersonSwitcher viewerId={viewer.id} people={people} />
      {/* Claude との話は本人だけのもの。人物を切り替えたら会話を持ち越さない */}
      <nav className="quick-links" aria-label="届いているもの">
        {eggs > 0 && <Link href="/me">贈り物の卵が届いています</Link>}
        <Link href="/inbox">
          受信箱
          {waiting > 0 && `（お願いが ${waiting} 件）`}
          {knowledgeTasks > 0 && `（知恵の確認が ${knowledgeTasks} 件）`}
        </Link>
        <Link href="/walk">歩きながら話す</Link>
        {viewer.role !== "student" && <Link href="/soudan">相談室への知らせを見る</Link>}
      </nav>
      <Talk
        key={viewer.id}
        viewer={{ name: viewer.name, label: viewer.label }}
        viewerId={viewer.id}
        promiseSeen={promiseSeen}
        avatarImage={rewards ? getAvatar(db, viewer.id).image : undefined}
        question={dailyQuestion(new Date())}
        initialAsk={askPerson ? { id: askPerson.id, name: askPerson.name } : null}
      />
      <HomeAside db={db} viewerId={viewer.id} rewards={rewards} />
    </main>
  );
}
