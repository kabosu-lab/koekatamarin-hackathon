/** 分身の絵。「/」で始まるものは描いた絵で、それ以外は .private/art/ の絵かコードで描いた代わりが返る。 */
export function Avatar({ image, alt, size = 96, lazy = false }: { image: string; alt: string; size?: number; lazy?: boolean }) {
  return (
    // 絵は手元の API から返すので、Next の画像の最適化は使わない
    <img className="avatar-image" src={image.startsWith("/") ? image : `/api/art/${image}`} alt={alt} width={size} height={size} loading={lazy ? "lazy" : undefined} />
  );
}
