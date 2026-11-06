import { expect, type Page } from "@playwright/test";

/** 使う人を切り替えて、話す画面へ戻る。話す画面には切り替えを置かないので「じぶん」で行う。 */
export async function switchPerson(page: Page, option: string) {
  // 人物の切り替えは「履歴と設定」の「設定」のタイルの中
  await page.goto("/me?open=settings");
  await page.getByLabel("試す人を切り替える").selectOption({ label: option });
  const switched = page.waitForResponse((response) => Boolean(response.request().headers()["next-action"]));
  await page.getByRole("button", { name: "切り替え" }).click();
  await switched;
  await page.goto("/");
  const name = option.split("（")[0];
  await expect(page.locator(`.talk[data-viewer="${name}"]`)).toBeVisible();
}

/** 画面の準備ができるまで待つ。準備の前に押しても、ボタンは反応しない。 */
export async function waitForMic(page: Page) {
  await page.waitForFunction(() => {
    const mic = document.querySelector(".device-mic");
    return mic !== null && Object.keys(mic).some((key) => key.startsWith("__reactProps"));
  });
}

/** マイクを押し続けてから離す。短い押し方は触っただけとして扱われる。 */
export async function holdMic(page: Page, ms = 500) {
  await waitForMic(page);
  await page.locator(".device-mic").hover();
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}
