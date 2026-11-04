import type { CSSProperties } from "react";
import type { StudyPresence } from "@/lib/study";

const POSES = ["study", "highfive", "cheer", "stretch"] as const;

/**
 * 自習室に見えるのは、人数と相棒だけ。名前も声も映像も、言葉もない。人は見るだけ。
 * 分身は勉強し、ときどき隣とハイタッチして、応援し、伸びをする。隣がいない分身は一人で伸びをする。
 */
export function PresenceView({ presence }: { presence: StudyPresence }) {
  return (
    <>
      <p className="study-count">いま {presence.count} 人が勉強しています</p>
      <div className="study-room">
        {presence.tokens.map((token, index) => {
          const partner = index % 2 === 0 ? presence.tokens[index + 1] : presence.tokens[index - 1];
          const side = partner === undefined ? "solo" : index % 2 === 0 ? "left" : "right";
          return (
            <div
              key={token}
              className={`study-buddy ${side}`}
              role="img"
              aria-label="勉強中の相棒"
              style={{ "--wait": `${-Math.floor(index / 2) * 5}s` } as CSSProperties}
            >
              {POSES.map((pose) => (
                <img key={pose} className={`pose ${pose}`} src={`/api/avatar/art/${token}/${pose}`} alt="" width={104} height={104} />
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}
