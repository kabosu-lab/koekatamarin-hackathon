"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const REFRESH_MS = 30 * 1000;

/** 開いておくだけで人数と相棒が新しくなる。 */
export function Refresher() {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [router]);
  return null;
}
