import { expect, type Locator, type Page, test } from "@playwright/test";

// とどけるのシートは、どの大きさでも見えている高さに収まり、送り先の札を一番下まで押せる。
// 下に貼り付いた送るボタン列（.compose-sheet-actions）の裏に札が隠れない
// （iPad の横の3列で生徒も見る段が、iPhone でチャネルが増えて一番下の「ありがとう」が押せなかった）。
// 札の数には頼らない：いくつあっても、最後の札まで同じように確かめる

test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: "koekata_today_seen", value: "1", domain: "127.0.0.1", path: "/" }]);
});

const SIZES = [
  { name: "iPhone", width: 390, height: 844 },
  { name: "iPad 縦", width: 820, height: 1180 },
  { name: "iPad 横", width: 1180, height: 820 },
  // Safari の上のツールバーとタブの分だけ低い（写真の形）
  { name: "iPad 横の Safari", width: 1180, height: 688 },
  { name: "パソコン", width: 1280, height: 800 },
];

async function openSheet(page: Page) {
  await page.goto("/");
  await page.getByLabel("パートナーに書く").fill(`札を押す ${test.info().testId}`);
  await page.getByRole("button", { name: "パートナーへ送る" }).click();
  await expect(page.getByRole("log").locator(".bubble.assistant").last()).toBeVisible();
  await page.getByRole("button", { name: "とどける" }).click();
  await expect(page.getByRole("button", { name: "本人として送る" })).toBeVisible();
  // 下書きが書き終わり、送り先の札が出るまで待つ
  await expect(page.locator(".bottom-sheet .compose-chip").first()).toBeVisible();
  await page.waitForTimeout(500);
}

type Box = { top: number; bottom: number; left: number; right: number };

const rectOf = (locator: Locator): Promise<Box> =>
  locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
  });

const actionsOf = (page: Page) => page.locator(".bottom-sheet .compose-sheet-actions");
const scrollerOf = (page: Page) => page.locator(".bottom-sheet .bottom-sheet-body");
const channelChips = (page: Page) => page.locator(".bottom-sheet").getByRole("radiogroup", { name: "送り先のチャネル" }).getByRole("radio");

async function expectActionsOnScreen(page: Page) {
  const actions = await rectOf(actionsOf(page));
  expect(actions.top, "ボタン列の上が画面の中").toBeGreaterThanOrEqual(0);
  expect(actions.bottom, "ボタン列の下が画面の中").toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  return actions;
}

/** 札が画面の中で、ボタン列の上にあり、真ん中に何もかぶさっていない */
async function expectTappable(page: Page, chip: Locator, name: string) {
  const actions = await expectActionsOnScreen(page);
  const rect = await rectOf(chip);
  expect(rect.top, `${name} の上が画面の中`).toBeGreaterThanOrEqual(0);
  expect(rect.bottom, `${name} がボタン列の裏に隠れない`).toBeLessThanOrEqual(actions.top + 0.5);
  const hit = await chip.evaluate((element) => {
    const r = element.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return top !== null && element.contains(top);
  });
  expect(hit, `${name} の上に何もかぶさっていない`).toBe(true);
  return rect;
}

/** 自動のスクロールなしに、見えている所を指で押す（Playwright の click は隠れた札を自分で送り出してしまう） */
async function tap(page: Page, rect: Box) {
  await page.touchscreen.tap((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2);
}

for (const size of SIZES) {
  test.describe(`${size.name}（${size.width}×${size.height}）`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
    });

    test("とどけるのシートの送り先の札を、最後の札まで押せる", async ({ page }) => {
      await openSheet(page);

      // シートは見えている高さの中に収まる
      const panel = await rectOf(page.locator(".bottom-sheet-panel"));
      expect(panel.top).toBeGreaterThanOrEqual(0);
      expect(panel.bottom).toBeLessThanOrEqual(size.height + 1);

      // 1つずつ見えるところへ送って、指で押す（札の数はいくつでも）
      const chips = page.locator(".bottom-sheet .compose-chip");
      const count = await chips.count();
      expect(count).toBeGreaterThan(1);
      for (let index = 0; index < count; index += 1) {
        const chip = chips.nth(index);
        await chip.evaluate((element) => element.scrollIntoView({ block: "nearest" }));
        const rect = await expectTappable(page, chip, `札 ${index + 1}／${count}`);
        await tap(page, rect);
        await expect(chip).toHaveAttribute("aria-checked", "true");
      }
      await expectActionsOnScreen(page);
      await page.screenshot({ path: test.info().outputPath(`sheet-${size.width}x${size.height}.png`) });
    });

    test("シートの中を一番下まで送ると、最後のチャネルの札がボタン列の上に出て押せる", async ({ page }) => {
      await openSheet(page);
      await scrollerOf(page).evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
      const last = channelChips(page).last();
      const rect = await expectTappable(page, last, "最後のチャネルの札");
      await tap(page, rect);
      await expect(last).toHaveAttribute("aria-checked", "true");
    });

    test("ありがとうのボタンから来た下書きは、選ばれた送り先（一番下のチャネル）が最初から見えて押せる", async ({ page }) => {
      await page.goto("/?thanks=noda");
      const selected = channelChips(page).and(page.locator('[aria-checked="true"]'));
      await expect(selected).toHaveCount(1);
      await expect(selected).toContainText("ありがとう");
      // 指でシートを送らなくても、ボタン列の裏から出てくる
      await expect
        .poll(async () => (await rectOf(selected)).bottom - (await rectOf(actionsOf(page))).top, { timeout: 5_000 })
        .toBeLessThanOrEqual(0.5);
      await expectTappable(page, selected, "選ばれた送り先の札");
      // ほかの札へ替えてから、もう一度この札を指で押せる
      const thanks = channelChips(page).filter({ hasText: "ありがとう" });
      await channelChips(page).first().click();
      await expect(thanks).toHaveAttribute("aria-checked", "false");
      await thanks.evaluate((element) => element.scrollIntoView({ block: "nearest" }));
      await tap(page, await expectTappable(page, thanks, "ありがとうの札"));
      await expect(thanks).toHaveAttribute("aria-checked", "true");
      await page.screenshot({ path: test.info().outputPath(`thanks-${size.width}x${size.height}.png`) });
    });
  });
}
