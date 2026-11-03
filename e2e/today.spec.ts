import { expect, test } from "@playwright/test";
import { switchPerson } from "./helpers";

test("カードは1枚ずつで、押さないと次が出ず、3枚で止まる", async ({ page }) => {
  await page.goto("/today");

  const count = page.locator(".today-card .count").first();
  await expect(count).toContainText("1 枚目");
  // 自動で流れない
  await page.waitForTimeout(500);
  await expect(count).toContainText("1 枚目");
  await expect(page.locator(".today-card")).toHaveCount(1);

  await page.getByRole("button", { name: "次へ" }).click();
  await expect(count).toContainText("2 枚目");
  await page.getByRole("button", { name: "次へ" }).click();
  await expect(count).toContainText("3 枚目");
  await page.getByRole("button", { name: "次へ" }).click();

  await expect(page.getByText("今日はここまで")).toBeVisible();
  await page.getByRole("button", { name: "もっと見る" }).click();
  await expect(count).toContainText("4 枚目");
});

test("応援のきっかけが添えられ、押すと応援になる", async ({ page }) => {
  await page.goto("/today?view=popular");
  await expect(page.locator(".hint-line")).toBeVisible();

  const button = page.getByRole("button", { name: /^応援/ });
  if ((await button.innerText()) === "応援する") await button.click();
  await expect(page.getByRole("button", { name: "応援しました" })).toBeDisabled();
});

test("カードで見ると、投稿した本人に誰が見たか伝わり、他の人には見えない", async ({ page }) => {
  const words = `見てもらう投稿 ${test.info().testId}`;
  await page.goto("/");
  await switchPerson(page, "中村 結衣（1年・吹奏楽部）");
  const response = await page.request.post("/api/publish", { data: { text: words, channelId: "clubs" } });
  const { postId } = (await response.json()) as { postId: string };

  await page.goto("/");
  await switchPerson(page, "川村 陽菜（理科・1年副担任）");
  expect((await page.request.post("/api/today/seen", { data: { postId } })).ok()).toBe(true);

  await page.goto("/");
  await switchPerson(page, "中村 結衣（1年・吹奏楽部）");
  await page.goto("/today");
  await expect(page.locator(".seen-note").filter({ hasText: words })).toContainText("川村 陽菜さん");

  await page.goto("/");
  await switchPerson(page, "木下 蓮（3年・ものづくり部）");
  await page.goto("/today");
  await expect(page.locator(".seen-note").filter({ hasText: words })).toHaveCount(0);
});

test("スマホ幅で横にはみ出さない", async ({ page }) => {
  await page.goto("/today");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});
