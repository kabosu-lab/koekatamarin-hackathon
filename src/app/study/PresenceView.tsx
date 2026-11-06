import type { CSSProperties } from "react";

const POSES = ["study", "highfive", "cheer", "stretch"] as const;

/** 勉強し、ときどき隣とハイタッチして、応援し、伸びをするパートナー。隣がいないパートナー（solo）は一人で伸びをする。 */
export function StudyBuddy({ token, side, order }: { token: string; side: "left" | "right" | "solo"; order: number }) {
  return (
    <div
      className={`study-buddy ${side}`}
      role="img"
      aria-label="勉強中のパートナー"
      style={{ "--wait": `${-order * 5}s` } as CSSProperties}
    >
      {POSES.map((pose) => (
        <img key={pose} className={`pose ${pose}`} src={`/api/avatar/art/${token}/${pose}`} alt="" width={104} height={104} />
      ))}
    </div>
  );
}
