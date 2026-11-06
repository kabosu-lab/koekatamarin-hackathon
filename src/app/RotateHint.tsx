/**
 * 0-2y (5)：低い横画面（iPhone の横など）では「縦にして使ってね」の絵を重ねる。
 * 出すかどうかは CSS のメディアクエリだけで決める（retro.css の「0-2y」）。動きを減らす設定では回さない。
 */
export function RotateHint() {
  return (
    <div className="rotate-hint" role="status" aria-label="縦にして使ってね">
      <svg className="rotate-hint-art" viewBox="0 0 200 160" aria-hidden="true">
        {/* 回る端末 */}
        <g className="rotate-hint-phone">
          <rect x="70" y="20" width="60" height="104" rx="12" fill="#2b3440" />
          <rect x="76" y="30" width="48" height="76" rx="6" fill="#bfe3c8" />
          <circle cx="100" cy="114" r="5" fill="#e9ebee" />
        </g>
        {/* パートナー：端末を見上げるまるい姿 */}
        <g className="rotate-hint-partner">
          <ellipse cx="44" cy="128" rx="30" ry="26" fill="#ffb37a" />
          <circle cx="35" cy="122" r="3.5" fill="#2b3440" />
          <circle cx="53" cy="122" r="3.5" fill="#2b3440" />
          <path d="M37 134 q7 6 14 0" stroke="#2b3440" strokeWidth="3" fill="none" strokeLinecap="round" />
        </g>
        {/* 回す向きの矢印 */}
        <path className="rotate-hint-arrow" d="M150 40 a40 40 0 0 1 10 46" stroke="#5a8f6a" strokeWidth="5" fill="none" strokeLinecap="round" />
        <path className="rotate-hint-arrow" d="M152 80 l8 8 l6 -11" stroke="#5a8f6a" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <p>縦にして使ってね</p>
    </div>
  );
}
