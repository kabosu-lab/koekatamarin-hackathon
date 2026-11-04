import { expect, type Page } from "@playwright/test";

/** 最初の画面で人物を切り替え、切り替わった会話の画面が出るまで待つ。 */
export async function switchPerson(page: Page, option: string) {
  await page.getByLabel("使う人").selectOption({ label: option });
  await page.getByRole("button", { name: "切り替え" }).click();
  const name = option.split("（")[0];
  // 見た目を選んでいない生徒は、レトロの最初の画面から始まる
  await expect(page.locator(`.talk[data-viewer="${name}"], .retro-home [aria-label="${name}さんの相棒"]`)).toBeVisible();
}

/** 最初の画面の「設定」を開く。音ときせかえはここにしまってある。 */
export async function openHomeSettings(page: Page) {
  const settings = page.locator(".home-settings");
  if ((await settings.getAttribute("open")) === null) await settings.locator("summary").click();
}
