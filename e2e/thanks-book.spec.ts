import { type Browser, expect, test } from "@playwright/test";
import { switchPerson } from "./helpers";
import { PROMISE_SEEN } from "./promise-seen";
import { openEnvelopes } from "./thanks-book";

// 0-3c：受け取ったサンクスカードの「カード帳」（「ありがとう」のタイルの中）

async function deliver(browser: Browser, fromId: string, toId: string, message: string) {
  const context = await browser.newContext();
  await context.addCookies([{ name: "koekata_person", value: fromId, domain: "127.0.0.1", path: "/" }, ...PROMISE_SEEN]);
  const page = await context.newPage();
  await page.goto("/api/health");
  expect((await page.request.post("/api/thanks", { data: { toPersonId: toId, message } })).ok()).toBe(true);
  await context.close();
}

test("まだ開けていないカードは封筒で先頭に並び、開けると絵柄つきのカードが新しい順に並ぶ。押すと全文と「ありがとうを返す」", async ({ page, browser }) => {
  const id = test.info().testId;
  const tail = `最後まで読めます ${id}`;
  const long = `${"いつも部活の準備を手伝ってくれて、本当に助かっています。".repeat(10)}${tail}`;
  const latest = `合格おめでとう！ ${id}`;
  await switchPerson(page, "木下 蓮（3年・ものづくり部）");
  await deliver(browser, "noda", "kinoshita", long);
  await deliver(browser, "kawamura", "kinoshita", latest);
  await page.goto("/me?open=thanks");

  const book = page.getByRole("region", { name: "もらったありがとう" });
  await expect(book.getByRole("heading", { name: /もらったカード \d+枚/ })).toBeVisible();
  // 封筒が先頭。言葉はまだ見えない
  const first = book.getByRole("listitem").first();
  await expect(first.getByRole("button", { name: /さんからの封筒を開ける$/ })).toBeVisible();
  await expect(book).not.toContainText(latest);

  // 封筒を押すと、0-3a の開封の演出
  await openEnvelopes(page);

  // 新しい順。種類の絵柄（おめでとう）が付く
  const cards = book.locator(".card-book-card");
  await expect(cards.first()).toContainText(latest);
  await expect(cards.first()).toHaveAttribute("data-kind", "congrats");
  await expect(book.locator(".card-book-kinds")).toContainText("おめでとう");

  // iPhone の幅では2列
  const boxes = await Promise.all([0, 1, 2].map((i) => book.getByRole("listitem").nth(i).boundingBox()));
  expect(Math.abs((boxes[0]?.y ?? 0) - (boxes[1]?.y ?? 1))).toBeLessThan(2);
  expect((boxes[2]?.y ?? 0) > (boxes[0]?.y ?? 0)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);

  // 押すと、くるっと表を向いて全文
  const longCard = cards.filter({ hasText: tail });
  await longCard.click();
  const viewer = page.getByRole("dialog", { name: "サンクスカード" });
  await expect(viewer).toBeVisible();
  await expect(page.locator(".thanks-reveal")).toHaveAttribute("data-phase", "card");
  await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest(".thanks-reveal")))).toBe(true);
  const front = viewer.locator(".thanks-reveal-front");
  await front.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(viewer.getByText(tail)).toBeInViewport();
  // 返すのは話す画面から（相手を入れた下書き）
  await expect(viewer.getByRole("link", { name: "野田 翔さんにありがとうを返す" })).toHaveAttribute("href", "/?thanks=noda");

  // 閉じると元の位置へ。焦点も押したカードへ戻る
  await page.keyboard.press("Escape");
  await expect(viewer).toBeHidden();
  await expect(longCard).toBeFocused();
  await expect(cards.first()).toContainText(latest);
});

test("広い画面（iPad の縦）では3列", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await switchPerson(page, "木下 蓮（3年・ものづくり部）");
  await page.goto("/me?open=thanks");
  const book = await openEnvelopes(page);
  const items = book.getByRole("listitem");
  if ((await items.count()) < 3) test.skip(true, "カードが3枚そろっていない");
  const boxes = await Promise.all([0, 1, 2].map((i) => items.nth(i).boundingBox()));
  expect(Math.abs((boxes[0]?.y ?? 0) - (boxes[2]?.y ?? 1))).toBeLessThan(2);
});

test("動きを減らす設定では、カードを押すと動かさずに表を出す", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await switchPerson(page, "木下 蓮（3年・ものづくり部）");
  await page.goto("/me?open=thanks");
  const book = await openEnvelopes(page);
  await book.locator(".card-book-card").first().click();
  await expect(page.locator(".thanks-reveal")).toHaveAttribute("data-phase", "card", { timeout: 300 });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "サンクスカード" })).toBeHidden();
});

test("カードが0枚のときは、空のカード帳に「最初の1枚は、誰かの役に立ったときに届きます」", async ({ page }) => {
  await switchPerson(page, "川村 陽菜（理科・1年副担任・生徒指導）");
  // 川村先生に届くのは、今日の1枚（学年主任から）だけ。しばらく出さないにして、0枚の形を見る
  await page.goto("/me?open=thanks");
  const hide = await page.request.post("/api/hidden", { data: { personId: "ogawara", hidden: true } });
  expect(hide.ok()).toBe(true);
  try {
    await page.goto("/me?open=thanks");
    const book = page.getByRole("region", { name: "もらったありがとう" });
    await expect(book.getByRole("heading", { name: "もらったカード 0枚" })).toBeVisible();
    await expect(book).toContainText("最初の1枚は、誰かの役に立ったときに届きます");
    await expect(book.getByRole("listitem")).toHaveCount(0);
  } finally {
    await page.request.post("/api/hidden", { data: { personId: "ogawara", hidden: false } });
  }
});
