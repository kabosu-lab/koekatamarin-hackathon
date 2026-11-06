import { Icon, type IconName } from "../Icon";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { countContributions, getAvatar, KIND_QUESTION, STYLE_QUESTION } from "@/lib/avatar";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { getDraft } from "@/lib/profile";
import { listThanks } from "@/lib/thanks";
import { listRecentPartners } from "@/lib/thanks-people";
import { ThanksKindMark } from "../thanks/ThanksCard";
import { listTitles, wornTitle } from "@/lib/titles";
import { PersonTitle } from "../PersonTitle";
import { TitleCollection } from "./TitleCollection";
import { Avatar } from "../Avatar";
import { companionImage } from "@/lib/companion-art";
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
import { listNewRibbons, listTrophyShelves, syncRibbonsOnOpen } from "@/lib/ribbons";
import { showsRewards } from "@/lib/rewards-view";
import { ArtRefresher, AvatarFromPhoto, AvatarQuiz, MemoryList, ProfileEditor, ThanksForm } from "./MeActions";

import { DeviceFrame } from "../DeviceFrame";
import { type MeTileKey, resolveOpenKey } from "./tiles";
import { Reflection } from "./Reflection";
import { SoFar } from "./SoFar";
import { getSoFar } from "@/lib/so-far";
import { PersonSwitcher } from "../PersonSwitcher";
import { selectablePeople } from "@/lib/people";
import { isTrialMode, onlyStudentsSelectable } from "@/lib/trial";
import { TrialTools } from "../TrialNotice";
import { DailyPanel } from "../daily/DailyPanel";
import { getReport, japanDate } from "@/lib/daily";
import { recipientsOf } from "@/lib/recipients";
import "./me.css";
export const metadata: Metadata = { title: "履歴と設定｜こえかた" };
export const dynamic = "force-dynamic";

export default async function MePage({ searchParams }: { searchParams: Promise<{ open?: string | string[]; term?: string | string[] }> }) {
  const { open: requested, term: requestedTerm } = await searchParams;
  const { viewer, people } = await getViewer();
  const store = await cookies();
  const appearance = readAppearance((name) => store.get(name)?.value);
  const db = getDatabase();
  // 隠している人にも裏で集まる
  syncRibbonsOnOpen(db, viewer.id, new Date());
  syncGiftEggs(db, viewer.id, new Date());
  const rewards = showsRewards(appearance);
  const photos = createDummyPhotos();
  const photoState = await getPhotoAvatarState(db, photos, viewer.id);
  const evolution = pendingEvolution(db, viewer.id);
  const avatar = getAvatar(db, viewer.id);
  const counts = countContributions(db, viewer.id);
  const goals = listGoals(db, viewer.id);
  const firstGoal = goals.find((goal) => goal.status === "active");
  const eggs = rewards ? listGiftEggs(db, viewer.id) : [];
  const trial = isTrialMode();
  const noun = viewer.role === "student" ? "日記" : "日報";
  const now = new Date();
  const openKey = resolveOpenKey(typeof requested === "string" ? requested : undefined);

  // 0-2b：タイルは6枚（3列×2段）。受信箱は「みんな」とホイール、話の履歴は「話す」の会話に任せる
  const tiles: {
    key: MeTileKey;
    label: string;
    icon: IconName;
    badge?: string;
    content: () => ReactNode;
  }[] = [
    {
      key: "daily",
      label: noun,
      icon: "note",
      content: () => (
        <DailyPanel
          key={`${viewer.id}-daily`}
          initialReport={getReport(db, viewer.id, japanDate(now))}
          recipients={recipientsOf(db, viewer.id)}
          viewerName={viewer.name}
          noun={noun}
        />
      ),
    },
    {
      key: "lookback",
      label: "ふりかえり",
      icon: "clock",
      content: () => (
        <Reflection
          db={db}
          viewer={viewer}
          now={now}
          rewards={rewards}
          trial={trial}
          noun={noun}
          requested={typeof requestedTerm === "string" ? requestedTerm : undefined}
        />
      ),
    },
    {
      key: "goals",
      label: "頑張りたいこと",
      icon: "flag",
      content: () => <GoalsPanel key={`${viewer.id}-goals`} initial={goals} initialNudge={getNudge(db, viewer.id)} />,
    },
    {
      key: "thanks",
      label: "ありがとう",
      icon: "thanks",
      content: () => {
        const thanks = listThanks(db, viewer.id);
        // 0-2j：一覧からは選ばせず、最近やりとりした人を数人だけ顔つきで出す
        const recent = listRecentPartners(db, viewer.id).map((p) => ({ ...p, image: getAvatar(db, p.id).image }));
        return (
          <>
            <ThanksForm key={`${viewer.id}-thanks`} recent={recent} />
            <section className="card" aria-label="もらったありがとう">
              <h2>もらったありがとう</h2>
              {thanks.length === 0 ? (
                <p className="muted">これから届きます。</p>
              ) : (
                thanks.map((card) => (
                  <p className="thanks-card" key={card.id} data-kind={card.kind}>
                    <ThanksKindMark kind={card.kind} />
                    <strong>{card.fromName}さん</strong>：{card.message}
                  </p>
                ))
              )}
            </section>
          </>
        );
      },
    },
    {
      // パートナーと、コレクション（卵、トロフィー）。どちらも報酬なので1つに
      key: "partner",
      label: "パートナー",
      icon: "me",
      badge: eggs.length > 0 ? String(eggs.length) : rewards && evolution !== null ? "!" : undefined,
      content: () => (
        <>
          {rewards && (
            <section className="card partner" aria-label="パートナー">
              <Avatar image={avatar.image} alt={`${viewer.name}さんのパートナー（${avatar.label}）`} />
              <div>
                <p className="muted">{avatar.label}</p>
                {photoState.talent && <p className="partner-talent">得意：{photoState.talent}</p>}
                <p className="muted">人とやり取りすると育ちます。休んでも減りません。</p>
              </div>
            </section>
          )}
          {appearance.theme === "modern" && (
            <form className="pop-note" action={setAppearance}>
              <span>パートナーが裏で育っています。ポップに切り替えると会えます。</span>
              <input type="hidden" name="name" value="theme" />
              <button type="submit" name="value" value="pop">
                ポップに切り替える
              </button>
            </form>
          )}
          {appearance.theme !== "modern" && appearance.avatar === "hide" && (
            <p className="muted">パートナーは隠しています。裏で育っています。</p>
          )}
          {evolution !== null && rewards && <EvolutionCard key={evolution} />}
          {/* 案に置き場所がないので、ようすは今のままパートナーの中に置く */}
          <Link className="me-sub-link" href="/yousu">
            ようす（パートナーの姿と、これまでの数）
          </Link>
          {rewards && photoState.status === "pending" && <ArtRefresher />}
          {rewards && photoState.canUsePhoto && (
            <AvatarFromPhoto
              label={photos.label}
              failed={photoState.status === "failed"}
              eggImage={`/api/avatar/art/${roomToken(db, viewer.id)}/egg`}
            />
          )}
          {rewards && !avatar.family && (
            <AvatarQuiz
              kindQuestion={{
                question: KIND_QUESTION.question,
                options: KIND_QUESTION.options,
              }}
              styleQuestion={{
                question: STYLE_QUESTION.question,
                options: STYLE_QUESTION.options,
              }}
            />
          )}
          {rewards && (
            <section className="me-collection" aria-label="コレクション">
              <h2>コレクション</h2>
              <GiftEggs key={`${viewer.id}-eggs`} eggs={eggs} companions={listCompanions(db, viewer.id)} />
              <Ribbons key={`${viewer.id}-ribbons`} shelves={listTrophyShelves(db, viewer.id)} />
            </section>
          )}
        </>
      ),
    },
    {
      // プロフィール → 見た目 → 覚えていること → 隠している人 → 使う人 → 試用版
      key: "settings",
      label: "設定",
      icon: "settings",
      content: () => {
        const { public_profile: profile } = db.prepare("SELECT public_profile FROM people WHERE id = ?").get(viewer.id) as {
          public_profile: string;
        };
        return (
          <>
            <p className="me-name">
              {viewer.name} <PersonTitle title={wornTitle(db, viewer.id)} />
            </p>
            <TitleCollection key={`${viewer.id}-titles`} initial={listTitles(db, viewer.id)} />
            <section className="card" aria-label="プロフィール">
              <h2>プロフィール</h2>
              <p data-testid="profile-text">{profile || "まだ載せていません。"}</p>
              <ProfileEditor key={viewer.id} initialDraft={getDraft(db, viewer.id)} hasProfile={profile !== ""} />
            </section>
            <section className="card appearance" aria-label="見た目">
              <h2>見た目</h2>
              {APPEARANCE_OPTIONS.filter((group) => group.name !== "theme" && group.name !== "sound")
                .filter((group) => group.name !== "avatar" || appearance.theme !== "modern")
                .map((group) => (
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
            <PersonSwitcher viewerId={viewer.id} people={selectablePeople(people, onlyStudentsSelectable())} />
            {/* 試用のときだけ、注意の読み直しと感想の入口 */}
            {trial && <TrialTools />}
          </>
        );
      },
    },
  ];
  const opened = tiles.find((tile) => tile.key === openKey);

  return (
    <DeviceFrame
      label="履歴と設定"
      dot={0}
      screen={
        // 上の窓は、パートナーと、いま頑張っていること。押すと「頑張りたいこと」が開く
        <Link className="me-screen" href="/me?open=goals">
          {rewards && avatar.family && (
            // パートナーはコードで描いた絵（声のかたまりか、育った動物）
            // eslint-disable-next-line @next/next/no-img-element
            <img src={companionImage(avatar.family, avatar.stage)} alt={`${viewer.name}さんのパートナー`} width={84} height={84} />
          )}
          <div>
            <small>いま頑張っていること</small>
            <strong>{firstGoal?.text ?? "話してくれたら、ここに残すよ"}</strong>
          </div>
        </Link>
      }
    >
      <main className="home" data-me={opened ? opened.key : "tiles"}>
        {opened ? (
          <>
            <header className="me-open-head">
              <Link className="me-back" href="/me">
                ‹ 履歴と設定
              </Link>
              <h1>{opened.label}</h1>
            </header>
            {opened.content()}
          </>
        ) : (
          <>
            <h1 className="visually-hidden">履歴と設定</h1>
            <nav className="me-tiles" aria-label="履歴と設定の項目">
              {tiles.map((tile) => (
                <Link key={tile.key} href={`/me?open=${tile.key}`} data-tile={tile.key}>
                  <span className="me-tile-face">
                    <Icon name={tile.icon} />
                    {tile.badge && <span className="me-tile-badge">{tile.badge}</span>}
                  </span>
                  <span className="me-tile-label">{tile.label}</span>
                </Link>
              ))}
            </nav>
            <SoFar
              key={viewer.id}
              personId={viewer.id}
              counts={{
                posts: counts.posts,
                comments: counts.comments,
                cheers: counts.cheers,
                goals: counts.goals,
                assists: counts.assists,
                thanks: counts.thanksReceived,
              }}
              story={getSoFar(db, viewer.id, now)}
              rewards={rewards}
            />
          </>
        )}
        {rewards && <RibbonMoment key={`${viewer.id}-moment`} ribbons={listNewRibbons(db, viewer.id)} />}
      </main>
    </DeviceFrame>
  );
}
