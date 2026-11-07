import { expect, type Page, test } from "@playwright/test";

// とどけるのシートは、どの大きさでも見えている高さに収まり、送り先の札を一番下まで押せる。
// 下に貼り付いた送るボタン列（.compose-sheet-actions）の下に札が隠れない（iPad の横の3列で、生徒も見る段が押せなかった）

test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: "koekata_today_seen", value: "1", domain: "127.0.0.1", path: "/" }]);
});

async function openSheet(page: Page) {
  await page.goto("/");
  await page.getByLabel("パートナーに書く").fill(`札を押す ${test.info().testId}`);
  await page.getByRole("button", { name: "パートナーへ送る" }).click();
  await expect(page.getByRole("log").locator(".bubble.assistant").last()).toBeVisible();
  await page.getByRole("button", { name: "とどける" }).click();
  await expect(page.getByRole("button", { name: "本人として送る" })).toBeVisible();
  // 下書きが書き終わり、送り先の札が出るまで待つ
  await expect(page.locator(".compose-sheet .compose-chip").first()).toBeVisible();
}

type Box = { top: number; bottom: number; left: number; right: number };

async function box(page: Page, selector: string, index = 0): Promise<Box> {
  return page.evaluate(
    ([selector, index]) => {
      const rect = document.querySelectorAll(selector)[index as number]!.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
    },
    [selector, index] as const,
  );
}

async function expectActionsOnScreen(page: Page) {
  const viewport = page.viewportSize()!;
  const actions = await box(page, ".bottom-sheet .compose-sheet-actions");
  expect(actions.top, "ボタン列の上が画面の中").toBeGreaterThanOrEqual(0);
  expect(actions.bottom, "ボタン列の下が画面の中").toBeLessThanOrEqual(viewport.height + 1);
  return actions;
}

for (const viewport of [
  { name: "iPhone", width: 390, height: 844 },
  { name: "iPad 縦", width: 820, height: 1180 },
  { name: "iPad 横", width: 1180, height: 820 },
  // Safari の上のツールバーとタブの分だけ低い（写真の形）
  { name: "iPad 横の Safari", width: 1180, height: 688 },
  { name: "パソコン", width: 1280, height: 800 },
]) {
  test(`${viewport.name}（${viewport.width}×${viewport.height}）：とどけるのシートの送り先の札を、最後の札まで押せる`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openSheet(page);

    // シートは見えている高さの中に収まる
    const panel = await box(page, ".bottom-sheet-panel");
    expect(panel.top).toBeGreaterThanOrEqual(0);
    expect(panel.bottom).toBeLessThanOrEqual(viewport.height + 1);

    const chips = page.locator(".bottom-sheet .compose-chip");
    const count = await chips.count();
    expect(count).toBeGreaterThan(1);
    for (let index = 0; index < count; index += 1) {
      const chip = chips.nth(index);
      await chip.evaluate((element) => element.scrollIntoView({ block: "nearest" }));
      const actions = await expectActionsOnScreen(page);
      const rect = await box(page, ".bottom-sheet .compose-chip", index);
      expect(rect.top, `札 ${index + 1} の上が画面の中`).toBeGreaterThanOrEqual(0);
      expect(rect.bottom, `札 ${index + 1} がボタン列に重ならない`).toBeLessThanOrEqual(actions.top + 0.5);
      // 札の真ん中を押すと、その札そのものに当たる（上に何もかぶさっていない）
      const hit = await chip.evaluate((element) => {
        const r = element.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return top !== null && element.contains(top);
      });
      expect(hit, `札 ${index + 1} の上に何もかぶさっていない`).toBe(true);
      await chip.click();
      await expect(chip).toHaveAttribute("aria-checked", "true");
    }
    await expectActionsOnScreen(page);
    await page.screenshot({ path: test.info().outputPath(`sheet-${viewport.width}x${viewport.height}.png`) });
  });
}
