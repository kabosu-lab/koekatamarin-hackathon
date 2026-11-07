import { expect, type Page, test } from "@playwright/test";
import { PROMISE_SEEN } from "./promise-seen";

// 0-2x：パートナーの窓の背景。生徒のレトロで見る
test.use({ storageState: { cookies: PROMISE_SEEN, origins: [] } });

async function asPerson(page: Page, id: string) {
  await page.context().addCookies([{ name: "koekata_person", value: id, domain: "127.0.0.1", path: "/" }]);
  // 0-3a：今日届くありがとう（封筒の知らせ）は開けておき、いつもの一言で見る
  await page.goto("/me?open=thanks");
}

const backdrop = (page: Page) => page.locator(".lcd > .partner-backdrop");

test("?bg= で時間と場所を固定でき、窓の中身の下に敷かれる", async ({ page }) => {
  await asPerson(page, "aoki");
  await page.goto("/?bg=night-library,plain");
  await expect(backdrop(page)).toHaveAttribute("data-time", "night");
  await expect(backdrop(page)).toHaveAttribute("data-place", "library");
  await expect(backdrop(page)).not.toHaveAttribute("data-rare", /.+/);
  // 背景は押せない。パートナーと吹き出しは背景より上で、そのまま押せる
  expect(await backdrop(page).evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
  await expect(page.getByRole("button", { name: /パートナー。触ると次の一言/ })).toBeVisible();
  for (const place of ["classroom", "schoolyard", "hallway"]) {
    await page.goto(`/?bg=morning-${place},plain`);
    await expect(backdrop(page)).toHaveAttribute("data-place", place);
    await expect(backdrop(page)).toHaveAttribute("data-time", "morning");
  }
});

test("時間は日本時間の時刻で切り替わる（朝のあと、時刻が進むと昼になる）", async ({ page }) => {
  await asPerson(page, "aoki");
  await page.clock.install({ time: new Date("2026-11-07T09:59:00+09:00") });
  await page.goto("/?bg=plain");
  await expect(backdrop(page)).toHaveAttribute("data-time", "morning");
  await page.clock.fastForward("02:00");
  await expect(backdrop(page)).toHaveAttribute("data-time", "noon");
  await page.clock.setFixedTime(new Date("2026-11-07T21:00:00+09:00"));
  await page.goto("/?bg=plain");
  await expect(backdrop(page)).toHaveAttribute("data-time", "night");
});

test("レアな背景はパートナーが一言添え、コレクション（端末）に残る", async ({ page }) => {
  await asPerson(page, "aoki");
  await page.goto("/?bg=rare-snow");
  await expect(backdrop(page)).toHaveAttribute("data-rare", "snow");
  await expect(page.locator(".partner-bubble")).toContainText("雪が降ってきたよ。あったかくしてね。");
  const seen = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((name) => name.startsWith("koekata:backdrop-rares:"));
    return key ? JSON.parse(localStorage.getItem(key) ?? "[]") : [];
  });
  expect(seen.map((item: { rare: string }) => item.rare)).toEqual(["snow"]);
  // 「履歴と設定」のパートナーのコレクションに並ぶ
  await page.goto("/me?open=partner");
  const shelf = page.getByRole("region", { name: "めずらしい背景" });
  await expect(shelf).toContainText("雪");
  await expect(shelf).toContainText("？？？");
});

test("話し始めると、背景はさらに淡くなる", async ({ page }) => {
  await asPerson(page, "aoki");
  await page.goto("/?bg=noon-classroom,plain");
  await expect(backdrop(page)).toHaveAttribute("data-time", "noon");
  const before = Number(await backdrop(page).evaluate((el) => getComputedStyle(el).opacity));
  expect(before).toBeGreaterThan(0.3);
  await page.getByLabel("パートナーに書く").fill(`背景のテスト ${test.info().testId}`);
  await page.getByRole("button", { name: "パートナーへ送る" }).click();
  await expect(page.locator(".talk.device")).toHaveAttribute("data-talking", "true");
  await expect.poll(async () => Number(await backdrop(page).evaluate((el) => getComputedStyle(el).opacity))).toBeLessThan(0.25);
});
