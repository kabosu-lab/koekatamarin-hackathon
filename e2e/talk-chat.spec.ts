import { expect, test } from "@playwright/test";

// 0-1l：話す画面の窓は LINE のような会話。左にアイコン付きのパートナー、右に自分。最新の言葉は頭から全部見える
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: "koekata_avatar", value: "hide", domain: "127.0.0.1", path: "/" }]);
});

for (const viewport of [
  { width: 390, height: 664 },
  { width: 820, height: 1180 },
  { width: 1180, height: 820 },
]) {
  test(`会話は左にパートナー・右に自分で、最新の言葉が全部見える（${viewport.width}×${viewport.height}）`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const input = page.getByLabel("パートナーに書く");
    const log = page.getByRole("log");
    const replies = log.locator(".bubble.assistant:not(.waiting)");
    const lines = ["今日の授業、急に静かになった瞬間があって", "こんにちは、ちょっと相談があるんだけど", "声を小さくしたら、みんな聞いてくれた"];
    for (const [index, line] of lines.entries()) {
      await input.fill(line);
      await input.press("Enter");
      await expect(replies).toHaveCount(index + 1);
      // 自分の言葉は右の吹き出しで、全部読める
      const mine = log.locator(".chat-row.me").last();
      await expect(mine).toContainText(line);
      await expect(mine.locator(".bubble")).toBeInViewport({ ratio: 1 });
      // パートナーの最新の返事も、頭から全部見える
      await expect(replies.last()).toBeInViewport({ ratio: 1 });
    }
    // 左右に分かれる
    const partnerBox = (await log.locator(".chat-row.partner .bubble").last().boundingBox())!;
    const meBox = (await log.locator(".chat-row.me .bubble").last().boundingBox())!;
    expect(partnerBox.x).toBeLessThan(meBox.x);
    // パートナーの行にはアイコンがある
    await expect(log.locator(".chat-row.partner .chat-icon:not(.chat-icon-space)").first()).toBeVisible();
    // 大きなパートナーは、会話のあいだは窓から下がる
    await expect(page.locator(".lcd-companion")).toBeHidden();
    // 広げて読むはもうない
    await expect(page.getByRole("button", { name: "広げて読む" })).toHaveCount(0);
  });
}

test("考え中は、アイコンの横の「…」の吹き出しになる", async ({ page }) => {
  await page.route("**/api/converse", async (route) => {
    await new Promise((done) => setTimeout(done, 800));
    await route.continue();
  });
  await page.goto("/");
  const input = page.getByLabel("パートナーに書く");
  await input.fill("こんにちは");
  await input.press("Enter");
  const waiting = page.getByRole("log").locator(".chat-row.partner .bubble.waiting");
  await expect(waiting).toBeVisible();
  await expect(waiting.locator(".thinking-dots i")).toHaveCount(3);
  await expect(waiting).toBeInViewport({ ratio: 1 });
  await expect(waiting).toHaveCount(0);
});
