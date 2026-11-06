import type { ReactNode } from "react";

/**
 * 「デモ用：使う人」を奥の画面の下に出すのは、古い形なのでやめた（0-1q）。
 * 使う人の切り替えは「履歴と設定」の「設定」のタイルの中だけに置く。
 * layout.tsx から呼ぶ行を本体が外すまで、何も描かない部品として残す。
 */
export function GlobalSwitcher(props: { children: ReactNode }) {
  void props;
  return null;
}
