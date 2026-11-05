import { expect, type Page } from "@playwright/test";

/** 使う人を切り替えて、話す画面へ戻る。話す画面には切り替えを置かないので「じぶん」で行う。 */
export async function switchPerson(page: Page, option: string) {
  await page.goto("/me");
  await page.getByLabel("使う人").selectOption({ label: option });
  const switched = page.waitForResponse((response) => Boolean(response.request().headers()["next-action"]));
  await page.getByRole("button", { name: "切り替え" }).click();
  await switched;
  await page.goto("/");
  const name = option.split("（")[0];
  await expect(page.locator(`.talk[data-viewer="${name}"]`)).toBeVisible();
}

/** マイクを押し続けてから離す。短い押し方は触っただけとして扱われる。 */
export async function holdMic(page: Page, ms = 500) {
  await page.locator(".device-mic").hover();
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}
