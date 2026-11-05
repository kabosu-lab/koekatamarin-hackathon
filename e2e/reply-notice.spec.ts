import { expect, type Browser, test } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

async function open(browser: Browser, personId: string) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies([{ name: "koekata_person", value: personId, domain: "127.0.0.1", path: "/" }]);
  return context.newPage();
}

/** 投稿した人に、別の人から返事を届ける。 */
async function replied(browser: Browser, authorId: string, replierId: string, words: string, answer: string) {
  const author = await open(browser, authorId);
  await author.goto("/");
  const posted = await author.request.post("/api/publish", { data: { text: words, channelId: "study" } });
  expect(posted.ok()).toBe(true);
  const replier = await open(browser, replierId);
  await replier.goto("/teams?channel=study");
  const post = replier.getByRole("article").filter({ hasText: words });
  await post.getByLabel("返信").fill(answer);
  await post.getByRole("button", { name: "返信", exact: true }).click();
  await expect(post.locator(".reply")).toContainText(answer);
  await replier.context().close();
  return author;
}

test("レトロの生徒の最初の画面に先生の返事が届き、マイクも画面の中に残る。閉じると次から出ない", async ({ browser }) => {
  const answer = `段取り表、いいですね ${test.info().testId}`;
  const page = await replied(browser, "aoki", "saeki", `段取り表を作った ${test.info().testId}`, answer);
  await page.goto("/");
  const notice = page.getByRole("region", { name: "届いた返事" });
  await expect(notice).toContainText("佐伯 みどりさんから返事が届きました");
  await expect(notice).toContainText(answer);
  await expect(notice).toBeInViewport();
  await expect(page.getByRole("button", { name: "話しかける" })).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);

  await notice.getByRole("button", { name: "閉じる" }).click();
  await expect(notice).toHaveCount(0);
  await page.goto("/");
  await expect(page.getByRole("region", { name: "届いた返事" })).toHaveCount(0);
});

test("先生の発信に別の先生の返事が届き、投稿を見るでその投稿へ移る", async ({ browser }) => {
  const words = `授業の最初に一言聞いてみた ${test.info().testId}`;
  const answer = `それ真似します ${test.info().testId}`;
  const page = await replied(browser, "kawamura", "noda", words, answer);
  await page.goto("/");
  const notice = page.getByRole("region", { name: "届いた返事" });
  await expect(notice).toContainText("野田 翔さんから返事が届きました");
  await notice.getByRole("button", { name: "投稿を見る" }).click();
  await expect(page).toHaveURL(/\/teams\?channel=study#post-/);
  await expect(page.getByRole("article").filter({ hasText: words }).locator(".reply")).toContainText(answer);
  await page.goto("/");
  await expect(page.getByRole("region", { name: "届いた返事" })).toHaveCount(0);
});
