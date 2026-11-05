import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { readAppearance } from "@/lib/appearance";
import { showsRewards } from "@/lib/rewards-view";
import { getViewer } from "@/lib/current-person";
import { selectablePeople } from "@/lib/people";
import { isTrialMode, TRIAL_NOTICE } from "@/lib/trial";
import { BottomNav } from "./BottomNav";
import { FeedbackSheet } from "./FeedbackSheet";
import { PersonSwitcher } from "./PersonSwitcher";
import { GlobalSwitcher } from "./GlobalSwitcher";
import { SwipeNav } from "./SwipeNav";
import { EmbedMark } from "./WidePanels";
import { TrialProvider } from "./TrialContext";
import "./globals.css";
import "./modern.css";
import "./usability.css";
import "./retro.css";

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
  const { viewer, people } = await getViewer();
  const appearance = readAppearance((name) => store.get(name)?.value);
  const { theme, size, sound } = appearance;
  const trial = isTrialMode();
  return (
    <html lang="ja" data-theme={theme} data-size={size} data-sound={sound} data-avatar={showsRewards(appearance) ? "show" : "hide"}>
      <body>
        {trial && (
          <div className="trial-banner">
            <span role="note">{TRIAL_NOTICE}</span> <FeedbackSheet />
          </div>
        )}
        <TrialProvider trial={trial}>
          {children}
          <GlobalSwitcher>
            <PersonSwitcher viewerId={viewer.id} people={selectablePeople(people, trial)} />
          </GlobalSwitcher>
          <BottomNav />
          <SwipeNav />
          <EmbedMark />
        </TrialProvider>
      </body>
    </html>
  );
}
