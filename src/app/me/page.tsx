import { Icon, type IconName } from "../Icon";
import type { ReactNode } from "react";
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
import { listNewRibbons, listTrophyShelves, syncRibbons } from "@/lib/ribbons";
import { showsRewards } from "@/lib/rewards-view";
import { ArtRefresher, AvatarFromPhoto, AvatarQuiz, MemoryList, ProfileEditor, ThanksForm } from "./MeActions";

import { DeviceFrame } from "../DeviceFrame";
import { LogView } from "../log/LogView";
import { PersonSwitcher } from "../PersonSwitcher";
import { selectablePeople } from "@/lib/people";
import { isTrialMode, onlyStudentsSelectable } from "@/lib/trial";
import { TrialTools } from "../TrialNotice";
export const metadata: Metadata = { title: "履歴と設定｜こえかた" };
export const dynamic = "force-dynamic";

export default async function MePage({ searchParams }: { searchParams: Promise<{ open?: string | string[] }> }) {
  const { open: requested } = await searchParams;
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

  const goals = listGoals(db, viewer.id);
  const firstGoal = goals.find((goal) => goal.status === "active");
  const eggs = rewards ? listGiftEggs(db, viewer.id) : [];
  const trial = isTrialMode();

  // 0-1e：真ん中は、iPhone のホーム画面のようなタイル。押すと中身が開き、「‹ 履歴と設定」で戻る
  const tiles: { key: string; label: string; icon: IconName; badge?: string; content: ReactNode }[] = [
    {
      key: "goals",
      label: "頑張りたいこと",
      icon: "flag",
      content: <GoalsPanel key={`${viewer.id}-goals`} initial={goals} initialNudge={getNudge(db, viewer.id)} />,
    },
    {
      key: "partner",
      label: "パートナー",
      icon: "me",
      badge: rewards && evolution !== null ? "!" : undefined,
      content: (
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
          {appearance.theme !== "modern" && appearance.avatar === "hide" && <p className="muted">パートナーは隠しています。裏で育っています。</p>}
          {evolution !== null && rewards && <EvolutionCard key={evolution} />}
          {rewards && photoState.status === "pending" && <ArtRefresher />}
          {rewards && photoState.canUsePhoto && <AvatarFromPhoto label={photos.label} failed={photoState.status === "failed"} eggImage={`/api/avatar/art/${roomToken(db, viewer.id)}/egg`} />}
          {rewards && !avatar.family && (
            <AvatarQuiz
              kindQuestion={{ question: KIND_QUESTION.question, options: KIND_QUESTION.options }}
              styleQuestion={{ question: STYLE_QUESTION.question, options: STYLE_QUESTION.options }}
            />
          )}
        </>
      ),
    },
    {
      key: "talk",
      label: "話の履歴",
      icon: "chat",
      content: (
        <section className="card retro-log" aria-label="パートナーとの話">
          <h2>パートナーとの話</h2>
          <p className="muted">この話はあなただけのものです。タブを閉じると消えます。</p>
          <LogView viewerName={viewer.name} />
          <nav aria-label="履歴から行ける画面">
            <ul>
              <li><Link href="/walk">歩きながら話す</Link></li>
              <li><Link href="/daily">一日のまとめ</Link></li>
              <li><Link href="/lookback">ふりかえり</Link></li>
              <li><Link href="/portfolio">ポートフォリオ</Link></li>
              <li><Link href="/yousu">ようす</Link></li>
            </ul>
          </nav>
        </section>
      ),
    },
    {
      key: "records",
      label: "記録",
      icon: "note",
      content: (
        <>
          <div className="hub-links">
            <Link href="/daily"><Icon name="note" />{viewer.role === "student" ? "今日の日記" : "今日の日報"}</Link>
            {viewer.role !== "student" && <Link href="/daily/received"><Icon name="inbox" />届いた日報と日記</Link>}
            <Link href="/lookback"><Icon name="clock" />ふりかえり</Link>
            <Link href="/portfolio"><Icon name="note" />ポートフォリオ</Link>
            <Link href="/inbox"><Icon name="inbox" />受信箱</Link>
          </div>
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
        </>
      ),
    },
    {
      key: "thanks",
      label: "ありがとう",
      icon: "thanks",
      content: (
        <>
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
        </>
      ),
    },
    ...(rewards
      ? [
          {
            key: "collect",
            label: "集める",
            icon: "gift" as const,
            badge: eggs.length > 0 ? String(eggs.length) : undefined,
            content: (
              <>
                <GiftEggs key={`${viewer.id}-eggs`} eggs={eggs} companions={listCompanions(db, viewer.id)} />
                <Ribbons key={`${viewer.id}-ribbons`} shelves={listTrophyShelves(db, viewer.id)} />
              </>
            ),
          },
        ]
      : []),
    {
      key: "profile",
      label: "プロフィール",
      icon: "star",
      content: (
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
        </>
      ),
    },
    {
      key: "settings",
      label: "設定",
      icon: "settings",
      content: (
        <>
          <section className="card appearance" aria-label="見た目">
            <h2>見た目</h2>
            {APPEARANCE_OPTIONS.filter((group) => group.name !== "theme" && group.name !== "sound").filter((group) => group.name !== "avatar" || appearance.theme !== "modern").map((group) => (
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
        </>
      ),
    },
    // 試用のときだけ、注意の読み直しと感想の入口
    ...(trial ? [{ key: "trial", label: "試用版", icon: "shield" as const, content: <TrialTools /> }] : []),
  ];
  const openKey = typeof requested === "string" ? requested : undefined;
  const opened = tiles.find((tile) => tile.key === openKey);

  return (
    <DeviceFrame
      label="履歴と設定"
      dot={0}
      screen={
        // 上の窓は、パートナーと、いま頑張っていること（名前は本人が知っているので出さない）
        <div className="me-screen">
          {rewards && avatar.family && (
            // パートナーはコードで描いた絵（声のかたまりか、育った動物）
            // eslint-disable-next-line @next/next/no-img-element
            <img src={companionImage(avatar.family, avatar.stage)} alt={`${viewer.name}さんのパートナー`} width={84} height={84} />
          )}
          <div>
            <small>いま頑張っていること</small>
            <strong>{firstGoal?.text ?? "まだありません"}</strong>
          </div>
        </div>
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
            {opened.content}
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
          </>
        )}
        {rewards && <RibbonMoment key={`${viewer.id}-moment`} ribbons={listNewRibbons(db, viewer.id)} />}
      </main>
    </DeviceFrame>
  );
}
