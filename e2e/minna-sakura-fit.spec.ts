import { expect, test } from "@playwright/test";
import { openScreen } from "./helpers";

// 0-3：みんなの上の桜は、どの幅でも木の全体（花・幹・地面）を縮めて収める。細い列で花だけ大きく切り取らない。
// 説明の文は2行まで（続きは「校内の桜 ›」の先）。写真は test-results に残す

test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: "koekata_today_seen", value: "1", domain: "127.0.0.1", path: "/" }]);
  // 木を見るため、はじめての春の見通しの吹き出しは出したことにしておく（吹き出しは e2e/sakura.spec.ts で確かめる）
  await context.addInitScript(() => {
    try {
      localStorage.setItem("koekata_sakura_explained", "1");
    } catch {}
  });
});

for (const viewport of [
  { name: "iPhone", width: 390, height: 844 },
  { name: "iPad縦", width: 820, height: 1180 },
  { name: "iPad横", width: 1180, height: 820 },
  { name: "パソコン", width: 1280, height: 800 },
]) {
  for (const theme of ["pop", "retro"]) {
    test(`${viewport.name} ${viewport.width}×${viewport.height}（${theme}）：桜の幹と地面が見え、絵の高さは 180〜220px、説明は2行まで`, async ({ page }, info) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.context().addCookies([{ name: "koekata_theme", value: theme, domain: "127.0.0.1", path: "/" }]);
      // 横向きでは3列の右の列（iframe）の中の「みんな」を見る
      const screen = await openScreen(page, "/minna");
      await expect(screen.locator(".koekata-sakura-art")).toBeVisible();
      await expect(screen.getByRole("note", { name: "春の見通し" })).toHaveCount(0);

      const measured = await screen.locator(".minna-scene").evaluate((scene) => {
        const rect = (element: Element | null) => {
          const box = element!.getBoundingClientRect();
          return { top: box.top, bottom: box.bottom, left: box.left, right: box.right, height: box.height };
        };
        const lines = (element: Element) => {
          const style = getComputedStyle(element);
          return Math.round(element.getBoundingClientRect().height / parseFloat(style.lineHeight));
        };
        return {
          viewHeight: window.innerHeight,
          scrollTop: scene.closest(".minna-scroll")!.getBoundingClientRect().top,
          scene: rect(scene),
          art: rect(scene.querySelector(".koekata-sakura-art")),
          trunk: rect(scene.querySelector(".koekata-sakura-trunk")),
          ground: rect(scene.querySelector(".koekata-sakura-ground")),
          caption: rect(scene.querySelector(".minna-sakura-caption")),
          storyLines: lines(scene.querySelector(".minna-sakura-story")!),
          linkLines: lines(scene.querySelector(".minna-sakura-link span")!),
        };
      });
      const { art, trunk, ground, caption, scene } = measured;
      // 絵の高さ
      expect(art.height).toBeGreaterThanOrEqual(180);
      expect(art.height).toBeLessThanOrEqual(220);
      // 絵は場面の中、窓の中に収まる
      expect(art.top).toBeGreaterThanOrEqual(scene.top - 0.5);
      expect(art.top).toBeGreaterThanOrEqual(measured.scrollTop);
      expect(art.bottom).toBeLessThanOrEqual(measured.viewHeight + 0.5);
      // 幹は絵の中にまるごとあり、説明に隠れない
      expect(trunk.top).toBeGreaterThanOrEqual(art.top - 0.5);
      expect(trunk.bottom).toBeLessThanOrEqual(art.bottom + 0.5);
      expect(trunk.left).toBeGreaterThanOrEqual(art.left - 0.5);
      expect(trunk.right).toBeLessThanOrEqual(art.right + 0.5);
      expect(trunk.height).toBeGreaterThan(20);
      expect(caption.top).toBeGreaterThanOrEqual(art.bottom - 0.5);
      // 地面は幹の下に、絵の下の端まで見えている
      expect(ground.top).toBeLessThan(art.bottom - 10);
      expect(ground.top).toBeGreaterThan(art.top);
      // 説明は2行まで
      expect(measured.storyLines).toBeLessThanOrEqual(2);
      expect(measured.linkLines).toBeLessThanOrEqual(2);

      await page.screenshot({ path: info.outputPath(`minna-sakura-${viewport.width}x${viewport.height}-${theme}.png`) });
    });
  }
}
