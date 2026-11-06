import { expect, test } from "@playwright/test";

// 0-1b：昼休みの試用で「会話を見る場所が狭い」の声が多かった。窓を広げて前のやり取りも読めること
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: "koekata_avatar", value: "hide", domain: "127.0.0.1", path: "/" }]);
});

for (const viewport of [
  { width: 1180, height: 820 },
  { width: 390, height: 844 },
]) {
  test(`会話の窓を広げて、前のやり取りを読み、閉じて戻る（幅 ${viewport.width}）`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const expand = page.getByRole("button", { name: "広げて読む" });
    // 話す前は出さない
    await expect(expand).toHaveCount(0);
    const input = page.getByLabel("パートナーに書く");
    const replies = page.getByRole("log").locator(".bubble.assistant:not(.waiting)");
    for (const [index, line] of ["今日の授業、急に静かになった瞬間があって", "こんにちは", "声を小さくしたら、みんな聞いてくれた"].entries()) {
      await input.fill(line);
      await input.press("Enter");
      await expect(replies).toHaveCount(index + 1);
    }

    await expand.click();
    const screen = page.getByRole("region", { name: "パートナーの画面" });
    const box = await screen.boundingBox();
    // 画面のほとんどを使う
    expect(box!.height).toBeGreaterThan(viewport.height * 0.85);
    // 最初の言葉まで、窓の中に見えている
    await expect(page.getByRole("log").locator(".bubble.user").first()).toBeInViewport();
    await expect(page.getByRole("button", { name: "閉じる" })).toHaveAttribute("aria-expanded", "true");

    await page.getByRole("button", { name: "閉じる" }).click();
    await expect(page.getByRole("button", { name: "広げて読む" })).toBeVisible();
    expect((await screen.boundingBox())!.height).toBeLessThan(viewport.height * 0.7);
  });
}

test("Esc で広げた窓を閉じる", async ({ page }) => {
  await page.goto("/");
  const input = page.getByLabel("パートナーに書く");
  await input.fill("こんにちは");
  await input.press("Enter");
  await expect(page.getByRole("log").locator(".bubble.assistant:not(.waiting)")).toHaveCount(1);
  await page.getByRole("button", { name: "広げて読む" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "広げて読む" })).toBeVisible();
});
