/** 相棒の絵。コードで描いた絵の URL を受け取る。 */
export function Avatar({ image, alt, size = 96, lazy = false }: { image: string; alt: string; size?: number; lazy?: boolean }) {
  return (
    // 絵は手元の API から返すので、Next の画像の最適化は使わない
    <img className="avatar-image" src={image.startsWith("/") ? image : `/api/art/${image}`} alt={alt} width={size} height={size} loading={lazy ? "lazy" : undefined} />
  );
}
