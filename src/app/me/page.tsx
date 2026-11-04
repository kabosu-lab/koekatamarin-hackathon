import { Icon } from "../Icon";
import type { Metadata } from "next";
import Link from "next/link";
import { countContributions, getAvatar, KIND_QUESTION, STYLE_QUESTION } from "@/lib/avatar";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { getDraft } from "@/lib/profile";
import { listThanks } from "@/lib/thanks";
import { listTitles, wornTitle } from "@/lib/titles";
import { PersonTitle } from "../PersonTitle";
import { TitleCollection } from "./TitleCollection";
import { Avatar } from "../Avatar";
import { cookies } from "next/headers";
import { APPEARANCE_OPTIONS, readAppearance } from "@/lib/appearance";
import { setAppearance } from "../person-actions";
import { SoundTest } from "./SoundTest";
import { HiddenPeople } from "./HiddenPeople";
import { GoalsPanel } from "./GoalsPanel";
import { getNudge, listGoals } from "@/lib/goals";
import { listHiddenPeople } from "@/lib/hidden-people";
import { getDestination } from "@/lib/destination/current";
import { listMemories } from "@/lib/memory";
import { getPhotoAvatarState, roomToken } from "@/lib/avatar-art";
import { pendingEvolution } from "@/lib/avatar-evolve";
import { createDummyPhotos } from "@/lib/profile-photo/dummy";
import { EvolutionCard } from "./EvolutionCard";
import { GiftEggs } from "./GiftEggs";
import { listCompanions, listGiftEggs, syncGiftEggs } from "@/lib/gift-eggs";
import { RibbonMoment } from "../RibbonMoment";
import { Ribbons } from "./Ribbons";
import { EVENT_SLOTS, listNewRibbons, listRibbons, STICKER_SLOTS, syncRibbons } from "@/lib/ribbons";
import { showsRewards } from "@/lib/rewards-view";
import { ArtRefresher, AvatarFromPhoto, AvatarQuiz, MemoryList, ProfileEditor, ThanksForm } from "./MeActions";

export const metadata: Metadata = { title: "じぶん｜こえかた" };
export const dynamic = "force-dynamic";

export default async function MePage() {
  const { viewer, people } = await getViewer();
  const store = await cookies();
  const appearance = readAppearance((name) => store.get(name)?.value);
  const db = getDatabase();
  // 隠している人にも裏で集まる
  syncRibbons(db, viewer.id, new Date());
  syncGiftEggs(db, viewer.id, new Date());
  const rewards = showsRewards(appearance);
  const photos = createDummyPhotos();
  const photoState = await getPhotoAvatarState(db, photos, viewer.id);
  const evolution = pendingEvolution(db, viewer.id);
  const avatar = getAvatar(db, viewer.id);
  const counts = countContributions(db, viewer.id);
  const { public_profile: profile } = db.prepare("SELECT public_profile FROM people WHERE id = ?").get(viewer.id) as {
    public_profile: string;
  };
  const thanks = listThanks(db, viewer.id);
  const others = people.filter((p) => p.id !== viewer.id).map(({ id, name, label }) => ({ id, name, label }));

  return (
    <main className="home">
      <header>
        <h1>じぶん</h1>
        <p className="me-name">
          {viewer.name} <PersonTitle title={wornTitle(db, viewer.id)} />
        </p>
      </header>

      <nav className="me-jump" aria-label="じぶんの中の行き先">
        <a href="#mine"><Icon name="me" />わたし</a>
        <a href="#records"><Icon name="note" />記録</a>
        <a href="#thanks"><Icon name="thanks" />ありがとう</a>
        {rewards && <a href="#collect"><Icon name="gift" />集める</a>}
        <a href="#settings"><Icon name="settings" />設定</a>
      </nav>

      <h2 className="group-title" id="mine"><Icon name="me" />わたし</h2>
      {rewards && (
      <section className="card partner" aria-label="相棒">
        <Avatar image={avatar.image} alt={`${viewer.name}さんの相棒（${avatar.label}）`} />
        <div>
          <p>
            <strong>{viewer.name}</strong>
          </p>
          <p className="muted">{avatar.label}</p>
                    {photoState.talent && <p className="partner-talent">得意：{photoState.talent}</p>}
          <p className="muted">人とやり取りすると育ちます。休んでも減りません。</p>
        </div>
      </section>
      )}

      {appearance.theme === "modern" && (
        <form className="pop-note" action={setAppearance}>
          <span>相棒が裏で育っています。ポップに切り替えると会えます。</span>
          <input type="hidden" name="name" value="theme" />
          <button type="submit" name="value" value="pop">
            ポップに切り替える
          </button>
        </form>
      )}
      {appearance.theme !== "modern" && appearance.avatar === "hide" && <p className="muted">相棒は隠しています。裏で育っています。</p>}
      {evolution !== null && rewards && <EvolutionCard key={evolution} />}
      {rewards && photoState.status === "pending" && <ArtRefresher />}
      {rewards && photoState.canUsePhoto && <AvatarFromPhoto label={photos.label} failed={photoState.status === "failed"} eggImage={`/api/avatar/art/${roomToken(db, viewer.id)}/egg`} />}

      {rewards && !avatar.family && (
        <AvatarQuiz
          kindQuestion={{ question: KIND_QUESTION.question, options: KIND_QUESTION.options }}
          styleQuestion={{ question: STYLE_QUESTION.question, options: STYLE_QUESTION.options }}
        />
      )}

      <TitleCollection key={`${viewer.id}-titles`} initial={listTitles(db, viewer.id)} />

      <section className="card" aria-label="プロフィール">
        <h2>プロフィール</h2>
        <p data-testid="profile-text">{profile || "まだ載せていません。"}</p>
        <ProfileEditor key={viewer.id} initialDraft={getDraft(db, viewer.id)} hasProfile={profile !== ""} />
      </section>

      <section className="card" aria-label="これまで">
        <h2>これまで</h2>
        <p className="counts">
          <span>投稿 {counts.posts}</span>
          <span>コメント {counts.comments}</span>
          <span>応援 {counts.cheers}</span>
          <span>解決 {counts.goals}</span>
          <span>つないだ {counts.assists}</span>
        </p>
      </section>

      <h2 className="group-title" id="records"><Icon name="note" />記録</h2>
      <div className="hub-links">
        <Link href="/daily"><Icon name="note" />{viewer.role === "student" ? "今日の日記" : "今日の日報"}</Link>
        {viewer.role !== "student" && <Link href="/daily/received"><Icon name="inbox" />届いた日報と日記</Link>}
        <Link href="/lookback"><Icon name="clock" />ふりかえり</Link>
        <Link href="/inbox"><Icon name="inbox" />受信箱</Link>
      </div>
      <GoalsPanel key={`${viewer.id}-goals`} initial={listGoals(db, viewer.id)} initialNudge={getNudge(db, viewer.id)} />

      <h2 className="group-title" id="thanks"><Icon name="thanks" />ありがとう</h2>
      <ThanksForm key={`${viewer.id}-thanks`} people={others} />
      <section className="card" aria-label="もらったありがとう">
        <h2>もらったありがとう</h2>
        {thanks.length === 0 ? (
          <p className="muted">これから届きます。</p>
        ) : (
          thanks.map((card) => (
            <p className="thanks-card" key={card.id}>
              <strong>{card.fromName}さん</strong>：{card.message}
            </p>
          ))
        )}
      </section>

      {rewards && <h2 className="group-title" id="collect"><Icon name="gift" />集める</h2>}
      {rewards && <GiftEggs key={`${viewer.id}-eggs`} eggs={listGiftEggs(db, viewer.id)} companions={listCompanions(db, viewer.id)} />}
      {rewards && <Ribbons key={`${viewer.id}-ribbons`} initial={listRibbons(db, viewer.id)} slots={STICKER_SLOTS} eventSlots={EVENT_SLOTS} />}
      {rewards && <RibbonMoment key={`${viewer.id}-moment`} ribbons={listNewRibbons(db, viewer.id)} />}

      <h2 className="group-title" id="settings"><Icon name="settings" />設定</h2>
      <section className="card appearance" aria-label="見た目">
        <h2>見た目</h2>
        {APPEARANCE_OPTIONS.filter((group) => group.name !== "avatar" || appearance.theme !== "modern").map((group) => (
          <form action={setAppearance} key={group.name}>
            <input type="hidden" name="name" value={group.name} />
            <p className="muted">{group.label}</p>
            <div className="row">
              {group.options.map((option) => (
                <button
                  key={option.value}
                  type="submit"
                  name="value"
                  value={option.value}
                  className="secondary"
                  aria-pressed={appearance[group.name] === option.value}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </form>
        ))}
        {appearance.sound === "on" && <SoundTest />}
      </section>

      <MemoryList key={`${viewer.id}-memory`} initial={listMemories(db, getDestination(db), viewer.id)} />
      <HiddenPeople key={`${viewer.id}-hidden`} initial={listHiddenPeople(db, viewer.id)} />
    </main>
  );
}
