import { expect, type Frame, type Page } from "@playwright/test";

/** 0-2y：3列にする広さか（src/lib/wide.ts の WIDE_QUERY と同じ） */
export function isWideViewport(page: Page) {
  const size = page.viewportSize();
  return Boolean(size && size.width >= 1024 && size.height >= 600);
}

/**
 * 画面を開き、その画面が出ている所を返す。
 * 広い画面では、奥の画面はホームの3列のその列（iframe）の中に開くので、列の中の frame を返す。狭い画面では page のまま。
 */
export async function openScreen(page: Page, path: string): Promise<Page | Frame> {
  await page.goto(path);
  if (!isWideViewport(page) || path === "/") return page;
  await expect(page).toHaveURL(/\/\?(left|right)=/);
  const side = new URL(page.url()).searchParams.has("left") ? "left" : "right";
  const iframe = page.locator(`.wide-panel[data-side=${side}] iframe`);
  const frame = (await (await iframe.elementHandle())!.contentFrame())!;
  await frame.waitForLoadState("load");
  await expect(frame.locator("main").first()).toBeVisible();
  return frame;
}

/** 使う人を切り替えて、話す画面へ戻る。話す画面には切り替えを置かないので「じぶん」で行う。 */
export async function switchPerson(page: Page, option: string) {
  // 人物の切り替えは「履歴と設定」の「設定」のタイルの中
  // 広い画面では、設定は3列の左の列の中（0-2y）
  const screen = await openScreen(page, "/me?open=settings");
  await screen.getByLabel("試す人を切り替える").selectOption({ label: option });
  const switched = page.waitForResponse((response) => Boolean(response.request().headers()["next-action"]));
  await screen.getByRole("button", { name: "切り替え" }).click();
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
