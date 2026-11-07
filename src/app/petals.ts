/** 0-3d：サンクスカードを送ったときに、画面に花びらを舞わせる（封筒の演出と同じ花びら）。動きを減らす設定では出さない */
export function scatterPetals(count = 16): void {
  if (typeof document === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const host = document.createElement("div");
  host.className = "card-petals";
  host.setAttribute("aria-hidden", "true");
  for (let i = 0; i < count; i++) {
    const petal = document.createElement("i");
    petal.style.setProperty("--x", `${Math.round(Math.random() * 100)}%`);
    petal.style.setProperty("--d", `${Math.round(Math.random() * 600)}ms`);
    petal.style.setProperty("--r", `${Math.round(Math.random() * 360)}deg`);
    host.appendChild(petal);
  }
  document.body.appendChild(host);
  window.setTimeout(() => host.remove(), 3400);
}
