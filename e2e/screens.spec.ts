import { expect, test, type Page } from "@playwright/test";

/**
 * 0-1q：すべての画面を iPhone の幅と iPad の縦・横で撮り、古い形が残っていないかを確かめる。
 * 写真は test-results に残る（見た目の取り違えを人の目で見つけるため）。棚卸しの表は docs/screens.md。
 */
const VIEWPORTS = [
  { name: "iPhone", width: 390, height: 844 },
  { name: "iPad縦", width: 820, height: 1180 },
  { name: "iPad横", width: 1180, height: 820 },
] as const;

/** 3枚の画面（話す・みんな・履歴と設定）。左右のスワイプと点が入口で、戻る印は持たない */
const MAIN_SCREENS = ["/", "/minna", "/me"];

/** 奥の画面。どれも左上に戻る印を1つ持つ */
const SUB_SCREENS = [
  "/sakura",
  "/today",
  "/inbox",
  "/teams",
  "/chie",
  "/chie/new",
  "/study/room",
  "/walk",
  "/daily",
  "/daily/received",
  "/lookback",
  "/portfolio",
  "/people/noda",
  "/soudan",
  "/yousu",
  "/koho",
];

/** Teams のタブに置く画面。アプリの中からは開かず、戻る印もない */
const EMBED_SCREENS = ["/tab"];

/**
 * 共通の外枠（src/app/ui/PageShell.tsx）を使わない奥の画面。
 * 桜は「みんな」の担当が作り直し中。校内チャネルは Teams に似せた画面なので外枠を持たない。
 * （/study は自習室 /study/room へ送るだけなので、ここには並べない）
 */
const OWN_FRAME = ["/sakura", "/teams"];

/** トロフィーの小さな知らせは押すとコレクションへ移るので、押さずに Esc で閉じる */
async function closeMoments(page: Page) {
  const toast = page.locator(".trophy-toast");
  if (await toast.isVisible().catch(() => false)) await page.keyboard.press("Escape");
}

async function shoot(page: Page, path: string, viewport: string) {
  const name = `${viewport}-${path === "/" ? "talk" : path.slice(1).replaceAll("/", "_")}.png`;
  // 入ってくる動き（200ms）の途中で撮らないよう、動きは終わった形で撮る
  await page.screenshot({ path: test.info().outputPath(name), fullPage: true, animations: "disabled" });
}

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.name}（${viewport.width}×${viewport.height}）`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
    });

    test("どの画面にも、下の3つのタブとデモ用の切り替えが出ず、横にはみ出さない", async ({ page }) => {
      test.setTimeout(240_000);
      for (const path of [...MAIN_SCREENS, ...SUB_SCREENS, ...EMBED_SCREENS]) {
        await page.goto(path);
        await closeMoments(page);
        await expect(page.locator(".bottom-nav"), path).toHaveCount(0);
        await expect(page.locator("body > .demo-switcher"), path).toHaveCount(0);
        await expect(page.getByText("デモ用：使う人"), path).toHaveCount(0);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, path).toBe(0);
        await shoot(page, path, viewport.name);
      }
    });

    test("奥の画面は同じ形：左上に戻る印が1つ、見出しが1つ、文は途中で切れない", async ({ page }) => {
      test.setTimeout(240_000);
      for (const path of SUB_SCREENS) {
        await page.goto(path);
        await closeMoments(page);
        await expect(page.locator("h1"), path).toHaveCount(1);
        const back = page.locator(".back-link");
        await expect(back, path).toHaveCount(1);
        await expect(back, path).toHaveText(/^‹ /);
        const box = await back.boundingBox();
        expect(box?.y, path).toBeLessThan(120);
        if (OWN_FRAME.includes(path)) continue;
        await expect(page.locator("main.page-shell"), path).toHaveCount(1);
        // 文が途中で切れる箱がない（行の数で切る指定を使わない）
        const clamped = await page.evaluate(() =>
          [...document.querySelectorAll("main *")]
            .filter((el) => {
              const style = getComputedStyle(el);
              return style.webkitLineClamp !== "none" && style.webkitLineClamp !== "";
            })
            .map((el) => `${el.tagName}.${el.getAttribute("class")}`),
        );
        expect(clamped, path).toEqual([]);
      }
    });
  });
}
