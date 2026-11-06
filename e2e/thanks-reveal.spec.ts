import { expect, type Page, test } from "@playwright/test";
import { switchPerson } from "./helpers";

// 0-3a：サンクスカードを受け取ったときの演出。ダミーの同僚から今日の1枚が、まだ開いていない状態で届いている

async function openEnvelope(page: Page) {
  const bubble = page.locator(".partner-bubble");
  await expect(bubble).toHaveText("ありがとうが届いてるよ", { timeout: 15_000 });
  await expect(page.locator(".lcd-companion[data-envelope]")).toHaveCount(1);
  await bubble.click();
  const reveal = page.getByRole("dialog", { name: "届いたサンクスカード" });
  await expect(reveal).toBeVisible();
  return reveal;
}

test("話す画面で封筒の吹き出しが出て、押すとカードが開き、しまうとカード帳に入って吹き出しが元に戻る", async ({ page }) => {
  await switchPerson(page, "中村 結衣（1年・吹奏楽部）");
  await page.goto("/");
  const reveal = await openEnvelope(page);

  // カードが表を向く（差出人と言葉と絵柄）
  await expect(page.locator(".thanks-reveal")).toHaveAttribute("data-phase", "card");
  const card = reveal.getByRole("article", { name: /さんからの(ありがとう|がんばったね|おめでとう)$/ });
  await expect(card).toBeVisible();
  const words = (await card.locator(".thanks-reveal-words").textContent()) ?? "";
  expect(words.length).toBeGreaterThan(0);
  await expect(page.locator(".thanks-reveal")).toHaveAttribute("data-kind", /^(thanks|effort|congrats)$/);

  await reveal.getByRole("button", { name: "カード帳にしまう" }).click();
  await expect(reveal).toBeHidden();
  // 開封済みになり、吹き出しはいつもの一言へ戻る
  await expect(page.locator(".partner-bubble")).not.toHaveText("ありがとうが届いてるよ");
  await expect(page.locator(".lcd-companion[data-envelope]")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".partner-bubble")).toBeVisible();
  await expect(page.locator(".partner-bubble")).not.toHaveText("ありがとうが届いてるよ");

  await page.goto("/me?open=thanks");
  await expect(page.getByRole("region", { name: "もらったありがとう" })).toContainText(words);
});

test("届いたカードの「ありがとうを返す」で、その人宛てのシートが開く", async ({ page }) => {
  await switchPerson(page, "木下 蓮（3年・ものづくり部）");
  await page.goto("/");
  const bubble = page.locator(".partner-bubble");
  // 木下さんには受信箱の知らせが先に出ることがあるので、受信箱を開けてから戻る
  await expect(bubble).toBeVisible();
  if ((await bubble.textContent())?.includes("受信箱") || (await bubble.textContent())?.includes("返事")) {
    await page.goto("/inbox");
    await page.goto("/");
  }
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

test("動きを減らす設定では、動かさずに表のカードを出す", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await switchPerson(page, "青木 ひより（2年）");
  await page.goto("/");
  const bubble = page.locator(".partner-bubble");
  await expect(bubble).toBeVisible();
  if (!(await bubble.textContent())?.includes("ありがとう")) {
    await page.goto("/inbox");
    await page.goto("/");
  }
  await openEnvelope(page);
  await expect(page.locator(".thanks-reveal")).toHaveAttribute("data-phase", "card", { timeout: 300 });
  await expect(page.locator(".thanks-reveal-petals")).toBeHidden();
});
