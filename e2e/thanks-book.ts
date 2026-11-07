import { expect, type Page } from "@playwright/test";

/**
 * 0-3c：カード帳では、この端末でまだ開けていないカードは封筒の形で、言葉は見えない。
 * 封筒を開けて（Esc で1枚ずつしまって）、カード帳にカードとして並ぶまで進める。
 * いまの画面が「ありがとう」のタイル（/me?open=thanks）であること。
 */
export async function openEnvelopes(page: Page) {
  const book = page.getByRole("region", { name: "もらったありがとう" });
  await expect(book).toBeVisible();
  const envelope = book.getByRole("button", { name: /さんからの封筒を開ける$/ });
  if ((await envelope.count()) === 0) return book;
  await envelope.first().click();
  const reveal = page.getByRole("dialog", { name: "届いたサンクスカード" });
  await expect(reveal).toBeVisible();
  for (let i = 0; i < 60 && (await reveal.isVisible()); i++) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
  }
  await expect(reveal).toBeHidden();
  await expect(envelope).toHaveCount(0);
  return book;
}
