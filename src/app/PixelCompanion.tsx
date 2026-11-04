import { PIXEL_SIZE, pixelSprite, spriteRects, type PixelStage } from "@/lib/pixel-companion";

const TONES: Record<string, string> = { "#": "var(--pixel-dark)", "+": "var(--pixel-mid)", o: "var(--pixel-light)" };

/** コードだけで描く相棒のドット絵。 */
export function PixelCompanion({ stage, branch, alt, size }: { stage: PixelStage; branch: string | null; alt: string; size: number }) {
  return (
    <svg
      className="pixel-companion"
      data-stage={stage}
      role="img"
      aria-label={alt}
      viewBox={`0 0 ${PIXEL_SIZE} ${PIXEL_SIZE}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
    >
      {spriteRects(pixelSprite(stage, branch)).map((rect) => (
        <rect key={`${rect.x}-${rect.y}`} x={rect.x} y={rect.y} width={rect.width} height={1} fill={TONES[rect.tone]} />
      ))}
    </svg>
  );
}
