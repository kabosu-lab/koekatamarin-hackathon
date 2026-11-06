import { lumpMarkup } from "@/lib/companion-art";
import type { LumpShapeName } from "@/lib/lump-shapes";

/** 会話の左に出す、パートナーの小さな丸いアイコン（0-1l）。3D は使わず静止画で軽く */
export function PartnerIcon({ image, color, shape }: { image?: string; color?: string; shape?: LumpShapeName }) {
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="chat-icon-art" src={image} alt="" />;
  }
  return <svg viewBox="0 0 200 200" className="chat-icon-art" aria-hidden="true" dangerouslySetInnerHTML={{ __html: lumpMarkup(color ?? "#7fcfc4", shape ?? "bubble") }} />;
}
