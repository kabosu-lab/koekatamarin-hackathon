import type { Metadata } from "next";
import Link from "next/link";
import { countContributions, getAvatar, KIND_QUESTION, STYLE_QUESTION } from "@/lib/avatar";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { getDraft } from "@/lib/profile";
import { listThanks } from "@/lib/thanks";
import { Avatar } from "../Avatar";
import { PersonSwitcher } from "../PersonSwitcher";
import { cookies } from "next/headers";
import { APPEARANCE_OPTIONS, readAppearance } from "@/lib/appearance";
import { setAppearance } from "../person-actions";
import { SoundTest } from "./SoundTest";
import { HiddenPeople } from "./HiddenPeople";
import { listHiddenPeople } from "@/lib/hidden-people";
import { createDummyTeams } from "@/lib/destination/dummy-teams";
import { listMemories } from "@/lib/memory";
import { getPhotoAvatarState, refreshAvatarArt } from "@/lib/avatar-art";
import { createClaude } from "@/lib/claude";
import { createDummyPhotos } from "@/lib/profile-photo/dummy";
import { ArtRefresher, AvatarFromPhoto, AvatarQuiz, MemoryList, ProfileEditor, ThanksForm } from "./MeActions";

export const metadata: Metadata = { title: "じぶん｜こえかた" };
export const dynamic = "force-dynamic";

export default async function MePage() {
  const { viewer, people } = await getViewer();
  const store = await cookies();
  const appearance = readAppearance((name) => store.get(name)?.value);
  const db = getDatabase();
  // 段階が変わったときだけ、裏で描き直す。画面は待たない
  void refreshAvatarArt(createClaude(), db, viewer.id);
  const photos = createDummyPhotos();
  const photoState = await getPhotoAvatarState(db, photos, viewer.id);
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
        <PersonSwitcher viewerId={viewer.id} people={people} />
      </header>

      <section className="card partner" aria-label="相棒">
        <Avatar image={avatar.image} alt={`${viewer.name}さんの相棒（${avatar.label}）`} />
        <div>
          <p>
            <strong>{viewer.name}</strong>
          </p>
          <p className="muted">{avatar.label}</p>
          <p className="muted">人とやり取りすると育ちます。休んでも減りません。</p>
        </div>
      </section>

      {photoState.status === "pending" && <ArtRefresher />}
      {photoState.canUsePhoto && <AvatarFromPhoto label={photos.label} failed={photoState.status === "failed"} />}

      {!avatar.family && (
        <AvatarQuiz
          kindQuestion={{ question: KIND_QUESTION.question, options: KIND_QUESTION.options }}
          styleQuestion={{ question: STYLE_QUESTION.question, options: STYLE_QUESTION.options }}
        />
      )}

      <section className="card" aria-label="プロフィール">
        <h2>プロフィール</h2>
        <p data-testid="profile-text">{profile || "まだ載せていません。"}</p>
        <ProfileEditor key={viewer.id} initialDraft={getDraft(db, viewer.id)} hasProfile={profile !== ""} />
      </section>

      <div className="hub-links">
        <Link href="/daily">{viewer.role === "student" ? "今日の日記" : "今日の日報"}</Link>
        {viewer.role !== "student" && <Link href="/daily/received">届いた日報と日記</Link>}
        <Link href="/lookback">ふりかえり</Link>
      </div>

      <MemoryList key={`${viewer.id}-memory`} initial={listMemories(db, createDummyTeams(db), viewer.id)} />

      <section className="card appearance" aria-label="見た目">
        <h2>見た目</h2>
        {APPEARANCE_OPTIONS.map((group) => (
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

      <HiddenPeople key={`${viewer.id}-hidden`} initial={listHiddenPeople(db, viewer.id)} />

      <section className="card" aria-label="これまで">
        <h2>これまで</h2>
        <p className="counts">
          <span>投稿 {counts.posts}</span>
          <span>コメント {counts.comments}</span>
          <span>応援 {counts.cheers}</span>
          <span>ゴール {counts.goals}</span>
          <span>アシスト {counts.assists}</span>
        </p>
      </section>

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

      <ThanksForm key={`${viewer.id}-thanks`} people={others} />
    </main>
  );
}
