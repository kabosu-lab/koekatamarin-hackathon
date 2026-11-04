import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { readAppearance } from "@/lib/appearance";
import { countContributions, getAvatar } from "@/lib/avatar";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { getDestination } from "@/lib/destination/current";
import { listMemories } from "@/lib/memory";
import { PIXEL_STAGE_LABELS, pixelStageFor } from "@/lib/pixel-companion";
import { showsRewards } from "@/lib/rewards-view";
import { BackLink } from "../BackLink";
import { PixelCompanion } from "../PixelCompanion";

export const metadata: Metadata = { title: "ようす｜こえかた" };
export const dynamic = "force-dynamic";

/** 今のようすを1画面に。数は自分だけが見るもので、人とは比べない。気持ちの推定は出さない。 */
export default async function YousuPage() {
  const { viewer } = await getViewer();
  const db = getDatabase();
  const store = await cookies();
  const rewards = showsRewards(readAppearance((name) => store.get(name)?.value, viewer.role));
  const avatar = getAvatar(db, viewer.id);
  const counts = countContributions(db, viewer.id);
  const stage = pixelStageFor(avatar.family, avatar.stage);
  const memories = listMemories(db, getDestination(db), viewer.id).length;

  return (
    <main className="yousu">
      <BackLink href="/">もどる</BackLink>
      <h1>ようす</h1>
      {rewards && <PixelCompanion stage={stage} branch={avatar.family} alt={`${viewer.name}さんの相棒`} size={144} />}
      <dl>
        <div>
          <dt>すがた</dt>
          <dd>{PIXEL_STAGE_LABELS[stage]}</dd>
        </div>
        <div>
          <dt>ありがとう</dt>
          <dd>{counts.thanksReceived}</dd>
        </div>
        <div>
          <dt>つないだ</dt>
          <dd>{counts.assists}</dd>
        </div>
        <div>
          <dt>覚えたこと</dt>
          <dd>{memories}</dd>
        </div>
      </dl>
      {avatar.family === null && (
        <p>
          <Link href="/me">じぶんの画面で、相棒を選べます。</Link>
        </p>
      )}
    </main>
  );
}
