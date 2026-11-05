import type { Metadata } from "next";
import Link from "next/link";
import { getViewer } from "@/lib/current-person";
import { LogView } from "./LogView";

export const metadata: Metadata = { title: "ログ｜こえかた" };
export const dynamic = "force-dynamic";

/** 話したことを読み返す画面。ひとつ先に、まとめや、歩きながら話す入口を置く。 */
export default async function LogPage() {
  const { viewer } = await getViewer();
  return (
    <main className="retro-log">
      <h1>ログ</h1>
      <p>この話はあなただけのものです。タブを閉じると消えます。</p>
      <LogView viewerName={viewer.name} />
      <nav aria-label="ログから行ける画面">
        <ul>
          <li>
            <Link href="/walk">歩きながら話す</Link>
          </li>
          <li>
            <Link href="/daily">一日のまとめ</Link>
          </li>
          <li>
            <Link href="/lookback">ふりかえり</Link>
          </li>
          <li>
            <Link href="/chie">校内の知恵</Link>
          </li>
          <li>
            <Link href="/yousu">ようす</Link>
          </li>
        </ul>
      </nav>
    </main>
  );
}
