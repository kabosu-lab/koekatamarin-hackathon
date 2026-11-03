import { expect, type Page } from "@playwright/test";

/** 最初の画面で人物を切り替え、切り替わった会話の画面が出るまで待つ。 */
export async function switchPerson(page: Page, option: string) {
  await page.getByLabel("使う人").selectOption({ label: option });
  await page.getByRole("button", { name: "切り替え" }).click();
  const name = option.split("（")[0];
  await expect(page.locator(`.talk[data-viewer="${name}"]`)).toBeVisible();
}
