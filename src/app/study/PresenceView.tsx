import { Avatar } from "../Avatar";
import type { StudyPresence } from "@/lib/study";

/** 自習室に見えるのは、人数と相棒だけ。名前も声も映像もない。 */
export function PresenceView({ presence }: { presence: StudyPresence }) {
  return (
    <>
      <p className="study-count">いま {presence.count} 人が勉強しています</p>
      <div className="study-people">
        {presence.images.map((image, index) => (
          <Avatar key={`${image}-${index}`} image={image} alt="勉強中の相棒" size={56} />
        ))}
      </div>
    </>
  );
}
