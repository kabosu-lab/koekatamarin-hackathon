"use client";

import { createContext, useContext, type ReactNode } from "react";

const TrialContext = createContext(false);
const KeepsWordsContext = createContext(true);

/** 試用モードかどうかを、画面の部品に渡す。環境変数はサーバーでしか読めないため。 */
export function TrialProvider({ trial, keepsWords = true, children }: { trial: boolean; keepsWords?: boolean; children: ReactNode }) {
  return (
    <TrialContext.Provider value={trial}>
      <KeepsWordsContext.Provider value={keepsWords}>{children}</KeepsWordsContext.Provider>
    </TrialContext.Provider>
  );
}

/** 話した言葉をパートナーに覚えさせてよいか。生徒の試用では残さない。 */
export function useKeepsWords(): boolean {
  return useContext(KeepsWordsContext);
}

export function useTrial(): boolean {
  return useContext(TrialContext);
}
