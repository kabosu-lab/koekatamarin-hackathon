import { expect, type Browser, type Page, test } from "@playwright/test";
import { PROMISE_SEEN } from "./promise-seen";

// 0-2v：新着は、パートナーの最初の一言・下の左右の点・みんなの下の帯・ホイールのチップ・履歴と設定のタイルで、同じ数で知らせる
test.use({ storageState: { cookies: PROMISE_SEEN, origins: [] } });

async function open(browser: Browser, personId: string) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies([
    { name: "koekata_person", value: personId, domain: "127.0.0.1", path: "/" },
    { name: "koekata_theme", value: "pop", domain: "127.0.0.1", path: "/" },
    ...PROMISE_SEEN,
  ]);
  return context.newPage();
}

/** 投稿した人に、別の人たちから返事を届ける。 */
async function replied(browser: Browser, authorId: string, replierIds: string[], words: string) {
  const author = await open(browser, authorId);
  // ほかのテストで届いた返事を先に読んでおき、このテストの分だけを数える
  await author.goto("/inbox");
  await author.goto("/");
  // 0-3a：話す画面を開くと届く今日の1枚（ダミーの同僚から）と、それで届くトロフィーは、開けたことにして数から外す
  // 開けたかは端末ごと（cookie）なので、この端末で「ありがとう」のタイルを開く
  await author.goto("/me?open=thanks");
  await author.goto("/");
  await author.goto("/me?open=partner");
  const posted = await author.request.post("/api/publish", { data: { text: words, channelId: "study" } });
  expect(posted.ok()).toBe(true);
  for (const [index, replierId] of replierIds.entries()) {
    const replier = await open(browser, replierId);
    await replier.goto("/teams?channel=study");
    const post = replier.getByRole("article").filter({ hasText: words });
    await post.getByLabel("返信").fill(`返事${index + 1} ${words}`);
    await post.getByRole("button", { name: "返信", exact: true }).click();
    await expect(post.locator(".reply")).toHaveCount(index + 1);
    await replier.context().close();
  }
  return author;
}

/** ホイールをなぞったまま、そのチップが出るまで回す。指は離さない */
async function turnTo(page: Page, label: string) {
  const wheel = (await page.locator(".click-wheel").boundingBox())!;
  const cx = wheel.x + wheel.width / 2;
  const cy = wheel.y + wheel.height / 2;
  const r = wheel.width * 0.44;
  const at = (deg: number) => ({ x: cx + r * Math.cos((deg * Math.PI) / 180), y: cy + r * Math.sin((deg * Math.PI) / 180) });
  await page.mouse.move(at(0).x, at(0).y);
  await page.mouse.down();
  const chip = page.locator(".wheel-carousel-slot").filter({ hasText: label });
  for (let deg = 10; deg <= 120 && (await chip.count()) === 0; deg += 10) await page.mouse.move(at(deg).x, at(deg).y, { steps: 2 });
  return {
    chip,
    release: async () => {
      // 真ん中のマイクの上で離して、何も開かずにやめる
      await page.mouse.move(cx, cy, { steps: 2 });
      await page.mouse.up();
    },
  };
}

test("返事が届くと、パートナーの最初の一言で知らせ、押すと受信箱の返事へ行く。別の帯は出さない", async ({ browser }) => {
  const page = await replied(browser, "kawamura", ["saeki"], `段取り表を作った ${test.info().testId}`);
  await page.goto("/");
  const bubble = page.locator(".partner-bubble");
  // 先生には、です・ます
  // 並んで動くデモのテストが、同じ先生の別の投稿に返すことがある。件数は次のテストで確かめる
  await expect(bubble).toHaveText(/^返事が[12]件届いています。みんなのほうにあります$/, { timeout: 15_000 });
  await expect(page.locator(".reply-toast")).toHaveCount(0);
  await expect(page.getByRole("status", { name: "届いた返事" })).toHaveCount(0);
  // 下の「みんな ›」の横に点。マイクは隠さない
  await expect(page.locator('.swipe-mark a[href="/minna"] .swipe-new')).toBeVisible();
  await expect(page.getByRole("button", { name: "押し続けて話す" })).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);

  await bubble.click();
  await expect(page).toHaveURL(/\/inbox#replies/);
  await expect(page.getByRole("region", { name: "届いた返事" })).toContainText("返事1");

  // 開いたら消える。次は、いつもの一言に戻る
  await page.goto("/");
  await expect(page.locator(".device-mic")).toBeVisible();
  await page.waitForTimeout(800);
  await expect(bubble).not.toContainText("返事が");
  await expect(page.getByRole("button", { name: "パートナー。触ると次の一言" })).toBeVisible();
});

test("同じ数を、ホーム・みんなの下の帯・ホイールのチップで出し、ありがとうは履歴と設定のタイルで出す", async ({ browser }) => {
  const page = await replied(browser, "fujimoto", ["saeki", "noda"], `実験の記録 ${test.info().testId}`);
  await page.goto("/");
  await expect(page.locator(".partner-bubble")).toHaveText("返事が2件届いています。みんなのほうにあります", { timeout: 15_000 });

  const thanker = await open(browser, "nakamura");
  const thanked = await thanker.request.post("/api/thanks", { data: { toPersonId: "fujimoto", message: "記録、助かりました" } });
  expect(thanked.ok()).toBe(true);
  await thanker.context().close();
  // 0-3a：ありがとうは、返事より先に封筒で知らせる
  await page.goto("/");
  await expect(page.locator(".partner-bubble")).toHaveText("ありがとうが届いています", { timeout: 15_000 });
  await expect(page.locator('.swipe-mark a[href="/me"] .swipe-new')).toBeVisible();
  await expect(page.locator('.swipe-mark a[href="/minna"] .swipe-new')).toBeVisible();

  // ホイールの受信箱のチップにも同じ数
  const wheel = await turnTo(page, "受信箱");
  await expect(wheel.chip.locator(".chip-badge")).toHaveText("2");
  await wheel.release();
  await expect(page.locator(".wheel-carousel")).toHaveAttribute("data-state", "idle");

  // みんなの下の帯の受信箱にも同じ数
  await page.goto("/minna");
  await expect(page.locator('.minna-dock a[href="/inbox"] .minna-dock-badge')).toHaveText("2");

  // ありがとうは履歴と設定のタイル。開いたら消える
  await page.goto("/me");
  await expect(page.locator('[data-tile="thanks"] .me-tile-badge')).toHaveText("1");
  await page.goto("/me?open=thanks");
  await page.goto("/me");
  await expect(page.locator('[data-tile="thanks"]')).toBeVisible();
  await expect(page.locator('[data-tile="thanks"] .me-tile-badge')).toHaveCount(0);
});

test("今日の3人をまだ見ていない日は、ホイールのチップに数が付き、みんなで見たら消える", async ({ browser }) => {
  const page = await open(browser, "nakamura");
  // ふだんのテストでは今日の3人を見たことにしているので、その印を外す
  await page.context().clearCookies({ name: "koekata_today_seen" });
  await page.goto("/");
  const wheel = await turnTo(page, "今日の3人");
  await expect(wheel.chip.first().locator(".chip-badge")).toHaveText(/^[1-3]$/);
  await wheel.release();
  await page.goto("/minna");
  await expect(page.getByRole("dialog", { name: /今日/ })).toBeVisible();
  // 見た印（cookie）は画面が動き出してから付く。付くのを待ってから戻る（重いときに先に移ると数が残る）
  await expect.poll(async () => (await page.context().cookies()).some((c) => c.name === "koekata_today_seen")).toBe(true);
  await page.goto("/");
  await expect(page.locator(".device-mic")).toBeVisible();
  // 今日の3人のチップの数だけを見る（受信箱の数は、ほかのテストの返事で付くことがある）
  await expect(page.locator(".wheel-carousel-slot").filter({ hasText: "今日の3人" }).locator(".chip-badge")).toHaveCount(0);
});
