import type { CSSProperties } from "react";
import type { StudyPresence } from "@/lib/study";

const POSES = ["study", "highfive", "cheer", "stretch"] as const;

/** 勉強し、ときどき隣とハイタッチして、応援し、伸びをする分身。隣がいない分身（solo）は一人で伸びをする。 */
export function StudyBuddy({ token, side, order }: { token: string; side: "left" | "right" | "solo"; order: number }) {
  return (
    <div
      className={`study-buddy ${side}`}
      role="img"
      aria-label="勉強中の相棒"
      style={{ "--wait": `${-order * 5}s` } as CSSProperties}
    >
      {POSES.map((pose) => (
        <img key={pose} className={`pose ${pose}`} src={`/api/avatar/art/${token}/${pose}`} alt="" width={104} height={104} />
      ))}
    </div>
  );
}

/** 自習室に見えるのは、人数と相棒だけ。名前も声も映像も、言葉もない。人は見るだけ。 */
export function PresenceView({ presence }: { presence: StudyPresence }) {
  return (
    <>
      <p className="study-count">いま {presence.count} 人が勉強しています</p>
      <div className="study-room">
        {presence.tokens.map((token, index) => {
          const partner = index % 2 === 0 ? presence.tokens[index + 1] : presence.tokens[index - 1];
          const side = partner === undefined ? "solo" : index % 2 === 0 ? "left" : "right";
          return <StudyBuddy key={token} token={token} side={side} order={Math.floor(index / 2)} />;
        })}
      </div>
    </>
  );
}
