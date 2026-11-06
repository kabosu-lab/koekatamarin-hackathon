import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { readAppearance } from "@/lib/appearance";
import { showsRewards } from "@/lib/rewards-view";
import { getViewer } from "@/lib/current-person";
import { collectsFeedback, isTrialMode, keepsSpokenWords, trialFeedbackHint, trialNotice } from "@/lib/trial";
import { TrialNotice } from "./TrialNotice";
import { FeedbackSheet } from "./FeedbackSheet";
import { SwipeNav } from "./SwipeNav";
import { EmbedMark } from "./WidePanels";
import { TrialProvider } from "./TrialContext";
import "./globals.css";
import "./modern.css";
import "./usability.css";
import "./retro.css";
// とどけるの光の段。retro.css の古い光を止めるので、retro.css より後に読む
import "./deliver-light.css";

export const metadata: Metadata = {
  title: "こえかた",
  description: "話すだけで、できることが増える。AI と仲間の力を借りて、もっと楽しく、もっと早く。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const store = await cookies();
  const { viewer } = await getViewer();
  const appearance = readAppearance((name) => store.get(name)?.value);
  const { theme, size, sound } = appearance;
  const trial = isTrialMode();
  return (
    <html lang="ja" data-theme={theme} data-size={size} data-sound={sound} data-avatar={showsRewards(appearance) ? "show" : "hide"}>
      <body>
        {/* 試用版の注意は、操作の前に1回だけカードで出す。消したあとは試用の印を出さない */}
        {trial && <TrialNotice text={trialNotice()} feedbackHint={trialFeedbackHint()} />}
        <TrialProvider trial={trial} keepsWords={keepsSpokenWords()}>
          {children}
          {/* 試用中の感想の入口（0-2h）。審査員用・本番・みんな用では出さない */}
          {collectsFeedback() && <FeedbackSheet />}
          <SwipeNav />
          <EmbedMark />
        </TrialProvider>
      </body>
    </html>
  );
}
