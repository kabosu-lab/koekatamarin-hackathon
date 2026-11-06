"use client";

import { useEffect, useState } from "react";
import { BACKDROP_RARES, parseSeenRares, RARE_LABELS, type SeenRare, seenRaresKey } from "@/lib/partner-backdrop";
import "../partner-backdrop.css";

/** 小さな印（背景の色の見本） */
const SWATCH: Record<SeenRare["rare"], string> = {
  sakura: "linear-gradient(135deg, #fbdbe3, #f3b0c3)",
  snow: "linear-gradient(135deg, #eef4fb, #c9d8ea)",
  rainbow: "linear-gradient(90deg, #ff6b6b, #ffe066, #69db7c, #4dabf7, #9775fa)",
  "shooting-star": "linear-gradient(135deg, #121a3a, #33437a)",
  festival: "linear-gradient(90deg, #ff6b6b, #ffd43b, #4dabf7)",
};

/**
 * パートナーの窓に出たレアな背景（0-2x）。端末に残した記録を読む。まだ見ていないものは「？？？」。
 * 1つも見ていないうちは出さない（あることを知るのも、出会ったときの楽しみに）。
 */
export function BackdropCollection({ owner }: { owner: string }) {
  const [seen, setSeen] = useState<SeenRare[]>([]);
  useEffect(() => {
    try {
      setSeen(parseSeenRares(window.localStorage.getItem(seenRaresKey(owner))));
    } catch {
      setSeen([]);
    }
  }, [owner]);

  if (seen.length === 0) return null;
  return (
    <section className="card pb-collection" aria-label="めずらしい背景">
      <h3>めずらしい背景</h3>
      <ul>
        {BACKDROP_RARES.map((rare) => {
          const found = seen.find((item) => item.rare === rare);
          return (
            <li key={rare} data-seen={found ? "true" : "false"}>
              <span className="pb-swatch" style={found ? { background: SWATCH[rare] } : undefined} aria-hidden="true" />
              <span>{found ? RARE_LABELS[rare] : "？？？"}</span>
              {found && <small>{found.firstSeen.replaceAll("-", "/")}</small>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
