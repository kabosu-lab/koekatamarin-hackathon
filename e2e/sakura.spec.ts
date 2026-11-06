import { expect, test } from "@playwright/test";

// 0-1j：校内の桜の意味が、見ただけで伝わる

test("みんなの桜の窓に、一行の説明と満開までの進みがあり、はじめては春の見通しが1回だけ出る", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/minna");
  const scroller = page.getByRole("region", { name: "みんな" });
  await expect(scroller.getByText("みんなのやり取りが葉になって、春の咲き方が決まります")).toBeInViewport();
  await expect(scroller.getByText(/満開まで あと\d+枚|満開に届きました|夜桜も見られそう/).first()).toBeInViewport();

  const note = page.getByRole("note", { name: "春の見通し" });
  await expect(note.getByRole("paragraph")).toHaveCount(3);
  await expect(note).toContainText(/春は「(控えめ|きれい|満開|夜桜)」に咲きそう/);
  await note.getByRole("button", { name: "閉じる" }).click();
  await expect(note).toHaveCount(0);

  // 2回目は自動では出ず、花の影を押すと出る
  await page.reload();
  await expect(scroller.getByRole("link", { name: "校内の桜" })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(note).toHaveCount(0);
  await page.getByRole("button", { name: /春の咲き方の見通し/ }).click();
  await expect(note).toBeVisible();
});

test("前に見たときより葉が増えていたら、増えた分が飛んできて「+N枚」と出る", async ({ page }) => {
  await page.goto("/minna");
  // 1回目は、見た枚数を残すだけ
  await expect.poll(() => page.evaluate(() => localStorage.getItem("koekata_sakura_seen_leaves"))).not.toBeNull();
  await expect(page.getByText(/^\+\d+枚$/)).toHaveCount(0);
  const seen = Number(await page.evaluate(() => localStorage.getItem("koekata_sakura_seen_leaves")));
  await page.evaluate((count) => localStorage.setItem("koekata_sakura_seen_leaves", String(count - 2)), seen);
  await page.reload();
  await expect(page.getByRole("status").filter({ hasText: "+2枚" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("koekata_sakura_seen_leaves"))).toBe(String(seen));
});

test("校内の桜の画面にも、一行の説明と春の見通しの3行がある", async ({ page }) => {
  await page.goto("/sakura");
  await expect(page.getByText("みんなのやり取りが葉になって、春の咲き方が決まります")).toBeVisible();
  await expect(page.getByRole("list", { name: "春の見通し" }).getByRole("listitem")).toHaveCount(3);
  await expect(page.getByRole("region", { name: "校内の桜" })).toHaveAttribute("data-season", /haru|natsu|aki|fuyu/);
});

test("動画用の早回しで、葉が集まり春に満開になる", async ({ page }) => {
  await page.goto("/sakura?hayaokuri=1");
  const scene = page.getByRole("region", { name: "校内の桜" });
  await expect(scene.getByRole("status")).toContainText(/葉 \d+ 枚/);
  await expect(scene.getByRole("status")).toHaveText("春、満開になりました", { timeout: 10_000 });
  await expect(scene).toHaveAttribute("data-season", "haru");
  await expect(scene.locator(".petal")).toHaveCount(18);
});
