import { expect, test } from "@playwright/test";

const PAGES = ["/", "/minna", "/me", "/today", "/chie", "/inbox", "/teams", "/study", "/study/room", "/daily", "/lookback"];

async function noOverflow(page: import("@playwright/test").Page, path: string) {
  await page.goto(path);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, path).toBe(0);
}

for (const [width, height, columns] of [
  [768, 1024, 2],
  [1280, 800, 3],
] as const) {
  test(`${width}px では横にはみ出さず、横のナビと ${columns} 列になる`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width, height });
    for (const path of PAGES) await noOverflow(page, path);

    await page.goto("/");
    const nav = await page.getByRole("navigation", { name: "画面の切り替え" }).boundingBox();
    expect(nav?.x).toBe(0);
    expect(nav?.height).toBeGreaterThan(height * 0.9);

    const talk = await page.locator(".talk").boundingBox();
    const channels = await page.getByRole("region", { name: "校内チャネルのようす" }).boundingBox();
    const world = await page.getByRole("region", { name: "分身と桜" }).boundingBox();
    expect(channels?.x).toBeGreaterThan((talk?.x ?? 0) + (talk?.width ?? 0) - 1);
    if (columns === 3) {
      expect(world?.x).toBeGreaterThan((channels?.x ?? 0) + (channels?.width ?? 0) - 1);
    } else {
      expect(world?.x).toBe(channels?.x);
    }
    await expect(page.getByRole("button", { name: "話しかける" })).toBeInViewport();
  });
}

test("スマホでは、広い画面の欄を出さず、タブは下にある", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("region", { name: "校内チャネルのようす" })).toHaveCount(0);
  const nav = await page.getByRole("navigation", { name: "画面の切り替え" }).boundingBox();
  expect(nav?.width).toBeGreaterThan(300);
});
