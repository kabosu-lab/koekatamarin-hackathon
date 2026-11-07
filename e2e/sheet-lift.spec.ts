import { expect, type Frame, type Locator, type Page, test } from "@playwright/test";

// 0-3m：横向きの3列（iPad 横・パソコン）では、シートや重ねの画面は列の中でなく、3列の上に全画面でせり上がる。
// 後ろの3列は暗幕で暗く inert、中身は最大 720px で真ん中、閉じると元の3列に戻る。iPhone・iPad 縦は今のまま。

const WIDE = [
  { name: "iPad横", width: 1180, height: 820 },
  { name: "パソコン", width: 1280, height: 800 },
] as const;

const NARROW = [
  { name: "iPhone", width: 390, height: 844 },
  { name: "iPad縦", width: 820, height: 1180 },
] as const;

test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: "koekata_today_seen", value: "1", domain: "127.0.0.1", path: "/" }]);
});

async function openCompose(page: Page) {
  await page.goto("/");
  await page.getByLabel("パートナーに書く").fill(`シートを上げる ${test.info().testId}`);
  await page.getByRole("button", { name: "パートナーへ送る" }).click();
  await expect(page.getByRole("log").locator(".bubble.assistant").last()).toBeVisible();
  await page.getByRole("button", { name: "とどける" }).click();
  await expect(page.getByRole("button", { name: "本人として送る" })).toBeVisible();
  await expect(page.locator(".compose-sheet .compose-chip").first()).toBeVisible();
}

async function columnFrame(page: Page, title: "履歴と設定" | "みんな", path?: string): Promise<{ element: Locator; frame: Frame }> {
  await page.goto(path ? `/?${title === "みんな" ? "right" : "left"}=${encodeURIComponent(path)}` : "/");
  const element = page.locator(`iframe[title="${title}"]`);
  await expect(element).toBeVisible();
  const frame = (await (await element.elementHandle())!.contentFrame())!;
  await frame.waitForLoadState("load");
  await expect(frame.locator("main").first()).toBeVisible();
  return { element, frame };
}

/** 真ん中で、720px 以下 */
async function expectCentered(content: Locator, page: Page) {
  const box = (await content.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.width, "中身の幅").toBeLessThanOrEqual(721);
  expect(Math.abs(box.x + box.width / 2 - viewport.width / 2), "真ん中").toBeLessThanOrEqual(2);
}

/** 暗幕が画面いっぱいで、暗い */
async function expectDimmed(scrim: Locator, page: Page) {
  const viewport = page.viewportSize()!;
  const box = (await scrim.boundingBox())!;
  expect(Math.round(box.x)).toBe(0);
  expect(Math.round(box.y)).toBe(0);
  expect(Math.round(box.width)).toBe(viewport.width);
  expect(Math.round(box.height)).toBe(viewport.height);
  const color = await scrim.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(color).not.toBe("rgba(0, 0, 0, 0)");
}

/** 列の iframe が画面いっぱいに広がり、裏の列は inert */
async function expectLifted(page: Page, element: Locator) {
  const viewport = page.viewportSize()!;
  await expect(element).toHaveAttribute("data-column-full", "true");
  const box = (await element.boundingBox())!;
  expect(Math.round(box.width)).toBe(viewport.width);
  expect(Math.round(box.height)).toBe(viewport.height);
  await expect(page.locator(".device-row > .retro-home")).toHaveAttribute("inert", "");
}

async function expectBack(page: Page, element: Locator, column: { x: number; width: number }) {
  await expect(element).not.toHaveAttribute("data-column-full", "true");
  await expect(page.locator(".device-row > .retro-home")).not.toHaveAttribute("inert", "");
  await expect(page.locator(".device-row > .wide-panel[inert]")).toHaveCount(0);
  const back = (await element.boundingBox())!;
  expect(Math.round(back.x)).toBe(Math.round(column.x));
  expect(Math.round(back.width)).toBe(Math.round(column.width));
}

for (const size of WIDE) {
  test.describe(`${size.name}（${size.width}×${size.height}）`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
    });

    test("とどけるのシートは3列の上に全画面でせり上がり、左右の列は inert、最後の札まで押せ、閉じると3列に戻る", async ({ page }) => {
      await openCompose(page);
      const lift = page.locator("dialog.sheet-lift[open]");
      await expect(lift).toHaveCount(1);
      await expectDimmed(page.locator(".sheet-lift .bottom-sheet-scrim"), page);
      await expectCentered(page.locator(".sheet-lift .bottom-sheet-panel"), page);
      await expect(page.locator(".device-row > .wide-panel")).toHaveCount(2);
      for (const side of await page.locator(".device-row > .wide-panel").all()) await expect(side).toHaveAttribute("inert", "");
      // 最後の札まで押せる（0-3m でも、担当39 のシートの高さの直しを保つ）
      const chips = page.locator(".sheet-lift .compose-chip");
      const lastChip = chips.last();
      await lastChip.evaluate((element) => element.scrollIntoView({ block: "nearest" }));
      await lastChip.click();
      await expect(lastChip).toHaveAttribute("aria-checked", "true");
      await page.waitForTimeout(300);
      await page.screenshot({ path: test.info().outputPath(`lift-compose-${size.width}x${size.height}.png`) });
      await page.keyboard.press("Escape");
      await expect(lift).toHaveCount(0);
      await expect(page.locator(".device-row > .wide-panel[inert]")).toHaveCount(0);
    });

    test("みんなの今日の3人は、右の列から3列の上に全画面で上がり、閉じると3列に戻る", async ({ page }) => {
      const { element, frame } = await columnFrame(page, "みんな");
      const column = (await element.boundingBox())!;
      await frame.getByRole("button", { name: "今日の3人" }).first().click();
      const modal = frame.getByRole("dialog", { name: "今日の3人" });
      await expect(modal).toBeVisible();
      await expectLifted(page, element);
      await expect(page.locator('.device-row > .wide-panel[data-side="left"]')).toHaveAttribute("inert", "");
      await expectDimmed(frame.locator(".minna-today-scrim"), page);
      await expectCentered(modal, page);
      await page.waitForTimeout(400);
      await page.screenshot({ path: test.info().outputPath(`lift-today-${size.width}x${size.height}.png`) });
      await modal.press("Escape");
      await expect(modal).toBeHidden();
      await expectBack(page, element, column);
    });

    test("みんなの返信の欄は、右の列から3列の上に全画面で上がり、閉じると3列に戻る", async ({ page }) => {
      const { element, frame } = await columnFrame(page, "みんな");
      const column = (await element.boundingBox())!;
      const scroller = frame.getByRole("region", { name: "みんな" });
      await scroller.getByRole("button", { name: "返信", exact: true }).first().click();
      const sheet = frame.getByRole("dialog", { name: /さんへの返信$/ });
      await expect(sheet).toBeVisible();
      await expectLifted(page, element);
      await expectDimmed(frame.locator(".minna-reply-scrim"), page);
      await expectCentered(sheet, page);
      await page.waitForTimeout(400);
      await page.screenshot({ path: test.info().outputPath(`lift-reply-${size.width}x${size.height}.png`) });
      await frame.locator(".minna-reply-scrim").click({ position: { x: 10, y: 10 } });
      await expect(sheet).toBeHidden();
      await expectBack(page, element, column);
    });

    test("これまでは、左の列から3列の上に全画面で上がり（画面いっぱいのまま）、閉じると3列に戻る", async ({ page }) => {
      const { element, frame } = await columnFrame(page, "履歴と設定");
      const column = (await element.boundingBox())!;
      await frame.getByRole("region", { name: "これまで" }).getByRole("button").click();
      const story = frame.getByRole("dialog", { name: "これまで" });
      await expect(story).toBeVisible();
      await expectLifted(page, element);
      await expect(page.locator('.device-row > .wide-panel[data-side="right"]')).toHaveAttribute("inert", "");
      await page.waitForTimeout(400);
      await page.screenshot({ path: test.info().outputPath(`lift-so-far-${size.width}x${size.height}.png`) });
      await story.getByRole("button", { name: "閉じる", exact: true }).click();
      await expect(story).toBeHidden();
      await expectBack(page, element, column);
    });

    test("自習室の名前の一覧は、右の列から3列の上に全画面で上がり、閉じると3列に戻る", async ({ page }) => {
      const { element, frame } = await columnFrame(page, "みんな", "/study/room?time=morning&people=30");
      const column = (await element.boundingBox())!;
      await frame.locator(".room-more").click();
      const list = frame.getByRole("dialog", { name: "ほかに勉強している人" });
      await expect(list).toBeVisible();
      await expectLifted(page, element);
      await expectCentered(list, page);
      await page.waitForTimeout(400);
      await page.screenshot({ path: test.info().outputPath(`lift-room-${size.width}x${size.height}.png`) });
      await list.getByRole("button", { name: "とじる" }).click();
      await expect(list).toBeHidden();
      await expectBack(page, element, column);
    });

    test("ありがとうのカード帳のカードは、左の列から3列の上に全画面で上がり、閉じると3列に戻る", async ({ page }) => {
      const { element, frame } = await columnFrame(page, "履歴と設定", "/me?open=thanks");
      const column = (await element.boundingBox())!;
      // 並んで動くほかのテストが同じ人にカードを届けるので、まだ開けていない封筒は先にしまっておき、読み返しのカードで確かめる
      const envelope = frame.getByRole("button", { name: /さんからの封筒を開ける$/ });
      const reveal = frame.getByRole("dialog", { name: "届いたサンクスカード" });
      for (let round = 0; round < 5 && (await envelope.count()) > 0; round++) {
        await envelope.first().click();
        await expect(reveal).toBeVisible();
        for (let i = 0; i < 60 && (await reveal.isVisible()); i++) {
          await page.keyboard.press("Escape");
          await page.waitForTimeout(250);
        }
        await expect(reveal).toBeHidden();
      }
      await expectBack(page, element, column);
      const cards = frame.locator(".card-book-card");
      test.skip((await cards.count()) === 0, "受け取ったカードがない");
      await cards.first().click();
      const viewer = frame.getByRole("dialog", { name: "サンクスカード" });
      await expect(viewer).toBeVisible();
      await expectLifted(page, element);
      await expectDimmed(frame.locator(".thanks-reveal-scrim"), page);
      await expectCentered(viewer, page);
      await page.waitForTimeout(1200);
      await page.screenshot({ path: test.info().outputPath(`lift-thanks-${size.width}x${size.height}.png`) });
      await page.keyboard.press("Escape");
      await expect(viewer).toBeHidden();
      await expectBack(page, element, column);
    });
  });
}

for (const size of NARROW) {
  test(`${size.name}（${size.width}×${size.height}）では、シートは今のまま（最上層の台を使わず、列も広げない）`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await openCompose(page);
    await expect(page.locator(".bottom-sheet[data-state=open]")).toBeVisible();
    await expect(page.locator("dialog.sheet-lift")).toHaveCount(0);
    await expect(page.locator("[data-column-full]")).toHaveCount(0);
    await page.goto("/minna");
    await page.getByRole("button", { name: "今日の3人" }).first().click();
    await expect(page.getByRole("dialog", { name: "今日の3人" })).toBeVisible();
    await expect(page.locator("html[data-column-lift]")).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath(`narrow-today-${size.width}x${size.height}.png`) });
  });
}
