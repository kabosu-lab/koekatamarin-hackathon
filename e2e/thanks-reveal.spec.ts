import { type Browser, expect, type Page, test } from "@playwright/test";
import { switchPerson } from "./helpers";
import { PROMISE_SEEN } from "./promise-seen";

// 0-3a：サンクスカードを受け取ったときの演出。ダミーの同僚から今日の1枚が、まだ開いていない状態で届いている

/**
 * 今日の1枚は、並んで動くほかのテストが「ありがとう」を開くと開封済みになることがある。
 * 確かめる直前に、別の人から1枚届けておく（どちらが先に出ても演出は同じ）。
 */
async function deliver(browser: Browser, fromId: string, toId: string) {
  const context = await browser.newContext();
  await context.addCookies([{ name: "koekata_person", value: fromId, domain: "127.0.0.1", path: "/" }, ...PROMISE_SEEN]);
  const page = await context.newPage();
  await page.goto("/api/health");
  const sent = await page.request.post("/api/thanks", { data: { toPersonId: toId, message: `いつも助かっています ${test.info().testId}` } });
  expect(sent.ok()).toBe(true);
  await context.close();
}

/** 生徒には「届いてるよ」、先生には「届いています」 */
const ARRIVED = /^ありがとうが届い(てるよ|ています)$/;

async function openEnvelope(page: Page) {
  const bubble = page.locator(".partner-bubble");
  await expect(bubble).toBeVisible();
  // ほかのテストから返事やお願いが届いていると、受信箱の知らせが先に出る。受信箱を開けてから戻る
  for (let i = 0; i < 3 && /受信箱|返事/.test((await bubble.textContent()) ?? ""); i++) {
    await page.goto("/inbox");
    await page.goto("/");
    await expect(bubble).toBeVisible();
  }
  await expect(bubble).toHaveText(ARRIVED, { timeout: 15_000 });
  await expect(page.locator(".lcd-companion[data-envelope]")).toHaveCount(1);
  await bubble.click();
  const reveal = page.getByRole("dialog", { name: "届いたサンクスカード" });
  await expect(reveal).toBeVisible();
  return reveal;
}

test("話す画面で封筒の吹き出しが出て、押すとカードが開き、しまうとカード帳に入って吹き出しが元に戻る", async ({ page, browser }) => {
  // ほかのテストからカードが届きにくい先生で確かめる（先生には、です・ます）
  await switchPerson(page, "大河原 誠（英語・学年主任）");
  await deliver(browser, "noda", "ogawara");
  await page.goto("/");
  const reveal = await openEnvelope(page);

  // カードが表を向く（差出人と言葉と絵柄）
  await expect(page.locator(".thanks-reveal")).toHaveAttribute("data-phase", "card");
  const card = reveal.getByRole("article", { name: /さんからの(ありがとう|がんばったね|おめでとう)$/ });
  await expect(card).toBeVisible();
  const words = (await card.locator(".thanks-reveal-words").textContent()) ?? "";
  expect(words.length).toBeGreaterThan(0);
  await expect(page.locator(".thanks-reveal")).toHaveAttribute("data-kind", /^(thanks|effort|congrats)$/);

  // 何枚か届いていれば、順に開けてから最後にしまう
  for (let i = 0; i < 5 && (await reveal.getByRole("button", { name: "しまって次へ" }).isVisible()); i++) {
    await reveal.getByRole("button", { name: "しまって次へ" }).click();
    await expect(page.locator(".thanks-reveal")).toHaveAttribute("data-phase", "card");
  }
  await reveal.getByRole("button", { name: "カード帳にしまう" }).click();
  await expect(reveal).toBeHidden();
  // 開封済みになり、吹き出しはいつもの一言へ戻る
  await expect(page.locator(".partner-bubble")).not.toHaveText(ARRIVED);
  await expect(page.locator(".lcd-companion[data-envelope]")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".partner-bubble")).toBeVisible();
  await expect(page.locator(".partner-bubble")).not.toHaveText(ARRIVED);

  await page.goto("/me?open=thanks");
  await expect(page.getByRole("region", { name: "もらったありがとう" })).toContainText(words);
});

test("届いたカードの「ありがとうを返す」で、その人宛てのシートが開く", async ({ page, browser }) => {
  await switchPerson(page, "木下 蓮（3年・ものづくり部）");
  await deliver(browser, "noda", "kinoshita");
  await page.goto("/");
  const reveal = await openEnvelope(page);
  const entry = reveal.getByRole("button", { name: /さんにありがとうを返す$/ });
  await expect(entry).toBeVisible();
  const name = ((await entry.getAttribute("aria-label")) ?? "").replace(/さんにありがとうを返す$/, "");
  await entry.click();
  const sheet = page.getByRole("dialog", { name: `${name}さんへのサンクスカード` });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByLabel("届けることば")).toBeInViewport();
  await sheet.getByLabel("届けることば").fill(`こちらこそ、ありがとうございます ${test.info().testId}`);
  await sheet.getByRole("button", { name: "サンクスカードを送る" }).click();
  await expect(entry).toContainText("届きました");
  await expect(sheet).toBeHidden();
  // 返したあとも、カードはまだ手元にある
  await expect(reveal).toBeVisible();
});

test("動きを減らす設定では、動かさずに表のカードを出す", async ({ page, browser }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await switchPerson(page, "青木 ひより（2年）");
  await deliver(browser, "kawamura", "aoki");
  await page.goto("/");
  await openEnvelope(page);
  await expect(page.locator(".thanks-reveal")).toHaveAttribute("data-phase", "card", { timeout: 300 });
  await expect(page.locator(".thanks-reveal-petals")).toBeHidden();
});
