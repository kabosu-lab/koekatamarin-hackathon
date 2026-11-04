import Link from "next/link";
import type { ReactNode } from "react";
import type { PixelStage } from "@/lib/pixel-companion";
import { Icon } from "./Icon";
import { PixelCompanion } from "./PixelCompanion";

/** レトロの最初の画面。液晶に相棒が1人と、大きなボタンが3つ。話す流れと下書きは今までと同じものへつなぐ。 */
export function RetroHome({
  message,
  showCompanion,
  stage,
  branch,
  name,
  quickLinks,
}: {
  message: string | null;
  showCompanion: boolean;
  stage: PixelStage;
  branch: string | null;
  name: string;
  quickLinks: ReactNode;
}) {
  return (
    <main className="retro-home">
      <header className="retro-top">
        <h1>こえかた</h1>
        <nav aria-label="ほかの画面">
          <Link href="/minna">みんな</Link>
          <Link href="/me">じぶん</Link>
          <Link href="/me#settings">
            <Icon name="settings" />
            設定
          </Link>
        </nav>
      </header>
      {quickLinks}
      <section className="retro-screen" aria-label="相棒">
        {showCompanion ? (
          <PixelCompanion stage={stage} branch={branch} alt={`${name}さんの相棒`} size={264} />
        ) : (
          <p>相棒は隠しています。裏で育っています。</p>
        )}
        {message && <p className="retro-message">{message}</p>}
      </section>
      <nav className="retro-actions" aria-label="すること">
        <Link href="/?talk=1">
          <Icon name="talk" />
          はなす
        </Link>
        <Link href="/yousu">
          <Icon name="star" />
          ようす
        </Link>
        <Link href="/?talk=send">
          <Icon name="send" />
          とどける
        </Link>
      </nav>
    </main>
  );
}
