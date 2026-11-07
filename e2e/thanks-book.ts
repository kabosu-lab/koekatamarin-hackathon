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
  const reveal = page.getByRole("dialog", { name: "届いたサンクスカード" });
  // 並んで動くほかのテストが、開けている間に新しいカードを届けることがある。封筒がなくなるまで繰り返す
  for (let round = 0; round < 5 && (await envelope.count()) > 0; round++) {
    await envelope.first().click();
    await expect(reveal).toBeVisible();
    for (let i = 0; i < 60 && (await reveal.isVisible()); i++) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(250);
    }
    await expect(reveal).toBeHidden();
  }
  await expect(envelope).toHaveCount(0);
  return book;
}
