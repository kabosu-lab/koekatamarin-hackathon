"use client";

import { createContext, useContext, type ReactNode } from "react";

const TrialContext = createContext(false);

/** 試用モードかどうかを、画面の部品に渡す。環境変数はサーバーでしか読めないため。 */
export function TrialProvider({ trial, children }: { trial: boolean; children: ReactNode }) {
  return <TrialContext.Provider value={trial}>{children}</TrialContext.Provider>;
}

export function useTrial(): boolean {
  return useContext(TrialContext);
}
