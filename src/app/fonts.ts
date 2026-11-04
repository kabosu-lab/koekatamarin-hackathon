import { DotGothic16 } from "next/font/google";

/** レトロの文字。使う画面でだけ読み込まれるよう、先読みしない。ビルドのときに取り込むので、外へは問い合わせない。 */
export const dotFont = DotGothic16({ weight: "400", subsets: ["latin"], variable: "--font-dot", preload: false, display: "swap" });
