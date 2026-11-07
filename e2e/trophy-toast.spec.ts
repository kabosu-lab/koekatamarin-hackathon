import { expect, type Browser, test } from "@playwright/test";
import { PROMISE_SEEN } from "./promise-seen";

test.use({ storageState: { cookies: PROMISE_SEEN, origins: [] } });

/** 生徒の初期のレトロで開く（先生も、飾りを出す見た目を選んだときに知らせが出る）。 */
async function open(browser: Browser, personId: string, theme = "retro", envelope = false) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies([
    { name: "koekata_person", value: personId, domain: "127.0.0.1", path: "/" },
    { name: "koekata_theme", value: theme, domain: "127.0.0.1", path: "/" },
    ...(envelope ? [] : [envelopeOpened(personId)]),
  ]);
  return context.newPage();
}

/** この端末で、届いたサンクスカードの封筒は開けたことにする（封筒が出ている間は知らせを待たせるので） */
function envelopeOpened(personId: string) {
  return { name: `koekata_thanks_seen_${personId}`, value: "9999-12-31T00:00:00.000Z", domain: "127.0.0.1", path: "/" };
}

/** 投稿した人に、白石先生（養護）から返事を届ける。それまでに届いていたトロフィーは見たことにしておく。 */
async function nurseReplied(browser: Browser, authorId: string, words: string, theme?: string, envelope = false) {
  const author = await open(browser, authorId, theme, envelope);
  await author.goto("/");
  await author.request.post("/api/ribbons", { data: { action: "seen" } });
  const posted = await author.request.post("/api/publish", { data: { text: words, channelId: "study" } });
  expect(posted.ok()).toBe(true);
  // 投稿で届いたトロフィーも見たことにして、返事で届くものだけを残す
  await author.goto("/");
  await author.request.post("/api/ribbons", { data: { action: "seen" } });

  const nurse = await open(browser, "shiraishi", "modern");
  await nurse.goto("/teams?channel=study");
  const post = nurse.getByRole("article").filter({ hasText: words });
  await post.getByLabel("返信").fill(`保健室でも話を聞きますね ${test.info().testId}`);
  await post.getByRole("button", { name: "返信", exact: true }).click();
  await expect(post.locator(".reply")).toHaveCount(1);
  await nurse.context().close();
  return author;
}

test("動画の場面：白石先生（養護）が生徒の投稿に返事をすると、生徒に「実績解除！ 保健室からの一言」が出る", async ({ browser }) => {
  const page = await nurseReplied(browser, "aoki", `保健室の前で迷った ${test.info().testId}`);
  await page.goto("/");
  const toast = page.locator(".trophy-toast");
  // 隠しトロフィーは「？？？」のあと、一拍おいて名前が出る
  await expect(toast).toContainText("？？？");
  await expect(toast).toContainText("実績解除！");
  const nurse = page.locator('.trophy-toast[data-trophy="nurse-word"]');
  await expect(nurse).toContainText("保健室からの一言", { timeout: 30_000 });
  await expect(nurse).toContainText("実績解除！");
  // 動画の確認用に、名前が出たところを残す
  await page.screenshot({ path: test.info().outputPath("trophy-toast.png") });
  // マイクを隠さず、横にはみ出さない
  await expect(page.getByRole("button", { name: "押し続けて話す" })).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  // 押すと、コレクションのそのトロフィーへ
  await nurse.click();
  await expect(page).toHaveURL(/\/me\?open=collect&trophy=nurse-word/);

  // 一度見せたら、次に開いたときは出ない
  await page.goto("/");
  await expect(page.locator(".device-mic")).toBeVisible();
  await page.waitForTimeout(800);
  await expect(page.locator('.trophy-toast[data-trophy="nurse-word"]')).toHaveCount(0);
});

test("知らせは2〜3秒で自分で消え、何個あっても1つずつ順に出る", async ({ browser }) => {
  const page = await nurseReplied(browser, "kinoshita", `部室の鍵の場所 ${test.info().testId}`);
  await page.goto("/");
  const toast = page.locator(".trophy-toast");
  await expect(toast).toHaveCount(1);
  await expect(page.locator('.trophy-toast[data-trophy="nurse-word"]')).toBeVisible({ timeout: 30_000 });
  // 重ねない
  expect(await toast.count()).toBe(1);
  // 最後まで見せたら、何も残らない
  await expect(toast).toHaveCount(0, { timeout: 30_000 });
});

test("先生には「実績解除」と言わず、「トロフィーが届きました：」と知らせる", async ({ browser }) => {
  const page = await nurseReplied(browser, "noda", `準備室の薬箱 ${test.info().testId}`, "pop");
  await page.goto("/");
  const nurse = page.locator('.trophy-toast[data-trophy="nurse-word"]');
  await expect(nurse).toContainText("トロフィーが届きました：保健室からの一言", { timeout: 30_000 });
  await expect(page.locator(".trophy-toast")).not.toContainText("実績解除");
});

test("開けていない封筒や封筒の演出が出ている間は知らせを待たせ、しまったあとに出す（差出人を先に見せない）", async ({ browser }) => {
  const page = await nurseReplied(browser, "nakamura", `図書室の返却棚 ${test.info().testId}`, undefined, true);
  // ほかのテストにかかわらず封筒が出るよう、1枚届けておく
  const from = await open(browser, "aoki");
  await from.goto("/api/health");
  expect((await from.request.post("/api/thanks", { data: { toPersonId: "nakamura", message: `いつもありがとう ${test.info().testId}` } })).ok()).toBe(true);
  await from.context().close();

  await page.goto("/");
  await expect(page.locator(".lcd-companion[data-envelope]")).toHaveCount(1, { timeout: 15_000 });
  await page.waitForTimeout(1500);
  await expect(page.locator(".trophy-toast")).toHaveCount(0);

  // 封筒を開けている間も出さない
  await page.locator(".partner-bubble").click();
  const reveal = page.getByRole("dialog", { name: "届いたサンクスカード" });
  await expect(reveal).toBeVisible();
  await page.waitForTimeout(800);
  await expect(page.locator(".trophy-toast")).toHaveCount(0);
  // 何枚か届いていれば、順にしまう
  await expect(async () => {
    const stash = reveal.getByRole("button", { name: /^(しまって次へ|カード帳にしまう)$/ });
    if (await stash.isVisible()) await stash.click({ timeout: 2000 });
    await expect(page.locator(".thanks-reveal")).toHaveCount(0, { timeout: 1500 });
  }).toPass({ timeout: 30_000 });
  // しまったあとに出る。窓の上には重ならない
  const nurse = page.locator('.trophy-toast[data-trophy="nurse-word"]');
  await expect(nurse).toBeVisible({ timeout: 30_000 });
  const toastBox = (await nurse.boundingBox())!;
  const windowBox = (await page.locator(".lcd").boundingBox())!;
  expect(toastBox.y).toBeGreaterThanOrEqual(windowBox.y + windowBox.height);
});
