import { expect, type Browser, test } from "@playwright/test";
import { holdMic } from "./helpers";
import { PROMISE_SEEN } from "./promise-seen";

test.use({ storageState: { cookies: PROMISE_SEEN, origins: [] } });

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

test("届いた返事は窓の上に短く出て、マイクを隠さず、次に開いたときは受信箱で読める", async ({ browser }) => {
  const answer = `段取り表、いいですね ${test.info().testId}`;
  const page = await replied(browser, "aoki", "saeki", `段取り表を作った ${test.info().testId}`, answer);
  await page.goto("/");
  const toast = page.getByRole("status", { name: "届いた返事" });
  await expect(toast).toContainText("佐伯 みどりさんから返事が届きました");
  await expect(toast).toContainText(answer);
  await expect(toast).toBeInViewport();
  await expect(page.getByRole("button", { name: "押し続けて話す" })).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);

  await toast.click();
  await expect(page).toHaveURL(/\/inbox#replies/);
  await expect(page.getByRole("region", { name: "届いた返事" })).toContainText(answer);

  await page.goto("/");
  await expect(page.locator(".device-mic")).toBeVisible();
  await expect(page.getByRole("status", { name: "届いた返事" })).toHaveCount(0);
});

test("話している間は出さず、話し終えてから出す", async ({ browser }) => {
  const answer = `それ真似します ${test.info().testId}`;
  const page = await open(browser, "kawamura");
  await page.addInitScript(() => {
    class FakeRecognition {
      onresult: unknown = null;
      onend: (() => void) | null = null;
      onerror: unknown = null;
      start() {}
      stop() {
        this.onend?.();
      }
    }
    Object.assign(window, { webkitSpeechRecognition: FakeRecognition, SpeechRecognition: FakeRecognition });
  });
  await page.goto("/");
  await page.locator(".device-mic").hover();
  await page.mouse.down();
  await replied(browser, "kawamura", "noda", `一言聞いてみた ${test.info().testId}`, answer);
  // 話している間に画面を開き直しても、知らせは待っている
  const toast = page.getByRole("status", { name: "届いた返事" });
  await expect(toast).toHaveCount(0);
  await page.mouse.up();
  await page.reload();
  await expect(toast).toContainText("野田 翔さんから返事が届きました");
  await holdMic(page, 400);
});

test("たまった返事は1件にまとめて「ほか」で数を出す", async ({ browser }) => {
  const words = `まとめて届く ${test.info().testId}`;
  const page = await replied(browser, "fujimoto", "noda", words, `一つ目 ${test.info().testId}`);
  const second = await open(browser, "saeki");
  await second.goto("/teams?channel=study");
  const post = second.getByRole("article").filter({ hasText: words });
  await post.getByLabel("返信").fill(`二つ目 ${test.info().testId}`);
  await post.getByRole("button", { name: "返信", exact: true }).click();
  await expect(post.locator(".reply")).toHaveCount(2);
  await page.goto("/");
  await expect(page.getByRole("status", { name: "届いた返事" })).toContainText("ほか1件");
});
