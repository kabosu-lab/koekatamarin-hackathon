"use client";

import type { NewRibbon } from "@/lib/ribbons";
import { TrophyToast } from "./TrophyToast";

/**
 * トロフィーが贈られた瞬間。全画面のモーダルはやめ、小さな知らせ（TrophyToast）1つにそろえた（0-2d）。
 * 呼んでいる画面（page.tsx、me/page.tsx）が TrophyToast を直接使うようになったら、このファイルは消してよい。
 */
export function RibbonMoment({ ribbons, hold }: { ribbons: NewRibbon[]; hold?: boolean }) {
  return <TrophyToast trophies={ribbons} hold={hold} />;
}
