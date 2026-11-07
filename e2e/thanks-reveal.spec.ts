import { type Browser, expect, type Page, test } from "@playwright/test";
import { switchPerson } from "./helpers";
import { PROMISE_SEEN } from "./promise-seen";

// 0-3a：サンクスカードを受け取ったときの演出。ダミーの同僚から今日の1枚が、まだ開いていない状態で届いている

/**
 * 今日の1枚は、並んで動くほかのテストが「ありがとう」を開くと開封済みになることがある。
 * 確かめる直前に、別の人から1枚届けておく（どちらが先に出ても演出は同じ）。
 */
async function deliver(browser: Browser, fromId: string, toId: string, message = `いつも助かっています ${test.info().testId}`) {
  const context = await browser.newContext();
  await context.addCookies([{ name: "koekata_person", value: fromId, domain: "127.0.0.1", path: "/" }, ...PROMISE_SEEN]);
  const page = await context.newPage();
  await page.goto("/api/health");
  const sent = await page.request.post("/api/thanks", { data: { toPersonId: toId, message } });
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

test("届いたカードの「ありがとうを返す」で、話す画面にその人宛てのカードの下書きが開く", async ({ page, browser }) => {
  await switchPerson(page, "木下 蓮（3年・ものづくり部）");
  await deliver(browser, "noda", "kinoshita");
  await page.goto("/");
  const reveal = await openEnvelope(page);
  const entry = reveal.getByRole("link", { name: /さんにありがとうを返す$/ });
  await expect(entry).toBeVisible();
  const name = ((await entry.getAttribute("aria-label")) ?? "").replace(/さんにありがとうを返す$/, "");
  await entry.click();
  // 0-3d：返すのも、ふつうの投稿と同じシート。宛名と【ありがとう】の札が入っている
  const sheet = page.getByRole("region", { name: "言葉にして送る" });
  await expect(sheet).toHaveAttribute("data-card", "thanks");
  await expect(sheet.locator(".preview-asked")).toHaveText(`${name}さんへ`);
  await expect(sheet.getByLabel("投稿の文章")).toBeInViewport();
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

/** 封筒を開け、言葉に text を含むカードが出るまで「しまって次へ」で進める */
async function untilCard(page: Page, text: string) {
  const reveal = page.getByRole("dialog", { name: "届いたサンクスカード" });
  for (let i = 0; i < 60; i++) {
    await expect(page.locator(".thanks-reveal")).toHaveAttribute("data-phase", "card");
    if (((await reveal.locator(".thanks-reveal-words").textContent()) ?? "").includes(text)) return reveal;
    await reveal.getByRole("button", { name: "しまって次へ" }).click();
  }
  throw new Error(`カードが見つかりません：${text}`);
}

test("長い言葉もカードの中で読め、開くと焦点がカードへ移り、後ろは押せず、Enter で開き直さない。Esc で閉じて元へ戻る", async ({ page, browser }) => {
  const tail = `最後まで読めます ${test.info().testId}`;
  const long = `${"いつも準備を手伝ってくれて、本当に助かっています。".repeat(14)}${tail}`;
  await switchPerson(page, "野田 翔（情報・ものづくり部顧問）");
  await deliver(browser, "kawamura", "noda", long);
  await page.goto("/");
  await openEnvelope(page);

  // 焦点はカードの中。後ろの画面は inert
  await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest(".thanks-reveal")))).toBe(true);
  expect(await page.locator("main").evaluate((el) => Boolean(el.closest("[inert]")))).toBe(true);

  const reveal = await untilCard(page, tail);
  const front = reveal.locator(".thanks-reveal-front");
  // 言葉は重ならず、カードの中だけスクロールして最後まで読める
  const sizes = await front.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }));
  expect(sizes.scroll).toBeGreaterThan(sizes.client);
  await front.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(reveal.getByText(tail)).toBeInViewport();
  // 並びの上で、言葉の下に差出人が続く（重ならない）
  const layout = await front.evaluate((el) => {
    const words = el.querySelector<HTMLElement>(".thanks-reveal-words")!;
    const from = el.querySelector<HTMLElement>(".thanks-reveal-from")!;
    return { wordsBottom: words.offsetTop + words.offsetHeight, fromTop: from.offsetTop };
  });
  expect(layout.wordsBottom).toBeLessThanOrEqual(layout.fromTop);
  // ボタンも画面の中
  await expect(reveal.getByRole("button", { name: /カード帳にしまう|しまって次へ/ })).toBeInViewport();

  // Tab はカードの中だけを回る
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest(".thanks-reveal")))).toBe(true);
  }

  // Enter を押しても、封筒からやり直さない（後ろの吹き出しは押せない）
  await reveal.locator(".thanks-reveal-front").focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(page.locator(".thanks-reveal")).toHaveCount(1);
  await expect(page.locator(".thanks-reveal")).toHaveAttribute("data-phase", "card");
  await expect(reveal.locator(".thanks-reveal-words")).toContainText(tail);

  // Esc で閉じる（何枚あっても、1枚ずつしまう）
  for (let i = 0; i < 60 && (await reveal.isVisible()); i++) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
  }
  await expect(reveal).toBeHidden();
  expect(await page.locator("main").evaluate((el) => Boolean(el.closest("[inert]")))).toBe(false);
  await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest(".lcd-companion")))).toBe(true);
});

test("開けたかは端末ごと。ある端末で開けても、別の端末では最初の1回は封筒が届く", async ({ page, browser }) => {
  await switchPerson(page, "白石 文（養護・相談室）");
  await page.goto("/");
  const reveal = await openEnvelope(page);
  for (let i = 0; i < 60 && (await reveal.isVisible()); i++) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
  }
  await expect(reveal).toBeHidden();

  // 別の端末（新しいブラウザの文脈）で同じ人を開く
  const other = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await other.addCookies([
    { name: "koekata_person", value: "shiraishi", domain: "127.0.0.1", path: "/" },
    { name: "koekata_theme", value: "pop", domain: "127.0.0.1", path: "/" },
    ...PROMISE_SEEN,
  ]);
  const second = await other.newPage();
  await second.goto("/");
  const again = await openEnvelope(second);
  await expect(second.locator(".thanks-reveal")).toHaveAttribute("data-phase", "card");
  await expect(again.getByRole("article", { name: /さんからの/ })).toBeVisible();
  await other.close();
});
