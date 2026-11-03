/** 分身の絵。.private/art/ に絵がなければ、コードで描いた代わりが返る。 */
export function Avatar({ image, alt, size = 96 }: { image: string; alt: string; size?: number }) {
  return (
    // 絵は手元の API から返すので、Next の画像の最適化は使わない
    <img className="avatar-image" src={`/api/art/${image}`} alt={alt} width={size} height={size} />
  );
}
