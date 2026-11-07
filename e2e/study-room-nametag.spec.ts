import { expect, type Frame, type Page, test } from "@playwright/test";
import { openScreen, switchPerson } from "./helpers";

/** 0-3f：自習室のパートナーを押すと名札が出る。名前・肩書・勉強している分だけで、ボタンは持たない */

async function noScroll(page: Page | Frame) {
  const sizes = await page.evaluate(() =>
    [document.documentElement, document.querySelector("main"), document.querySelector(".room-stage")].map((element) => [
      element?.scrollHeight ?? -1,
      element?.clientHeight ?? -1,
    ]),
  );
  for (const [scroll, client] of sizes) expect(scroll).toBeLessThanOrEqual(client);
}

test("ほかの人のパートナーを押すと、弾んで名札が出て、2〜3秒で消える", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/study/room?time=morning");
  const seat = page.locator(".room-seat[data-seat]").first();
  await seat.click();
  await expect(seat).toHaveClass(/is-poked/);
  const tag = page.locator(".room-tag");
  await expect(tag).toBeVisible();
  await expect(tag.locator(".room-tag-name")).not.toHaveText("");
  await expect(tag).toContainText(/\d+分 勉強中/);
  // 名札にはボタンを置かない。職員室のことも出さない
  await expect(tag.locator("button")).toHaveCount(0);
  await expect(tag).not.toContainText("職員室");
  // 景色の中に収まり、スクロールも出ない
  const frame = (await page.locator(".room-frame").boundingBox())!;
  const box = (await tag.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(frame.x - 0.5);
  expect(box.x + box.width).toBeLessThanOrEqual(frame.x + frame.width + 0.5);
  expect(box.y).toBeGreaterThanOrEqual(frame.y - 0.5);
  await noScroll(page);
  await expect(tag).toBeHidden({ timeout: 5_000 });
});

test("外を押しても名札は消える", async ({ page }) => {
  await page.goto("/study/room?time=morning");
  await page.locator(".room-seat[data-seat]").first().click();
  await expect(page.locator(".room-tag")).toBeVisible();
  await page.getByRole("heading", { name: "自習室" }).click();
  await expect(page.locator(".room-tag")).toBeHidden();
});

test("自分のパートナーを押すと、自分の名札が出る（ボタンはない）", async ({ page }) => {
  await page.goto("/");
  await switchPerson(page, "野田 翔（情報・ものづくり部顧問）");
  await page.goto("/study/room?time=morning");
  const start = page.getByRole("button", { name: /25分/ });
  if (await start.isVisible()) await start.click();
  await expect(page.getByRole("timer")).toBeVisible();
  await page.reload();

  const tag = page.locator(".room-tag");
  const seats = await page.locator(".room-seat[data-seat]").all();
  let found = false;
  for (const seat of seats) {
    await seat.click();
    await expect(tag).toBeVisible();
    if ((await tag.innerText()).includes("（じぶん）")) {
      found = true;
      break;
    }
  }
  expect(found).toBe(true);
  await expect(tag).toContainText("野田 翔（じぶん）");
  await expect(tag).toContainText("情報・ものづくり部顧問");
  await expect(tag).toContainText(/\d+分 勉強中/);
  await expect(tag.locator("button")).toHaveCount(0);
  await page.getByRole("button", { name: "ここまでにする" }).click();
});

for (const [width, height] of [
  [390, 844],
  [1180, 820],
] as const) {
  test(`${width}px で、影の束を押すと、座りきれない人の名前と肩書の一覧が出る`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    // 横向きでは、自習室は3列の右の列の中に開く（0-2y）
    const screen = await openScreen(page, "/study/room?time=morning&people=30");
    await expect(screen.locator(".room-more")).toHaveText("ほか 18人");
    await screen.locator(".room-shadow").first().click();
    const list = screen.getByRole("dialog", { name: "ほかに勉強している人" });
    await expect(list).toBeVisible();
    await expect(list.locator("li")).toHaveCount(18);
    await expect(list.locator("li strong").first()).not.toHaveText("");
    await expect(list).not.toContainText("職員室");
    await noScroll(screen);
    await list.getByRole("button", { name: "とじる" }).click();
    await expect(list).toBeHidden();
    // 「ほか N人」の札からも開ける
    await screen.locator(".room-more").click();
    await expect(list).toBeVisible();
  });
}

test("動きを減らす設定では、押しても弾まない", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/study/room?time=morning");
  const seat = page.locator(".room-seat[data-seat]").first();
  await seat.click();
  await expect(page.locator(".room-tag")).toBeVisible();
  expect(await seat.evaluate((element) => element.getAnimations().length)).toBe(0);
});

test("Teams のタブの景色は押せないまま", async ({ page }) => {
  await page.goto("/tab");
  await expect(page.locator(".room-seat[tabindex]")).toHaveCount(0);
  await expect(page.locator(".room-tag")).toHaveCount(0);
});
