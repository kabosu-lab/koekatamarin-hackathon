import { expect, type Frame, type Page, test } from "@playwright/test";
import { isWideViewport } from "./helpers";
import { PROMISE_SEEN } from "./promise-seen";

// ホイールのチップから開いたときも、いつもの入口（みんなの下の帯・履歴と設定のタイル・帯の「今日の3人」）から開いたときと同じ出方にする。
// 狭い画面では帯がその画面へ動いて、その中で開く。3列では属する列の中で開く。今日の3人は、みんなの中のモーダルとして出る。

const SIZES = [
  { name: "iPhone", viewport: { width: 390, height: 844 }, isMobile: true },
  { name: "iPad 縦", viewport: { width: 820, height: 1180 }, isMobile: false },
  { name: "iPad 横", viewport: { width: 1180, height: 820 }, isMobile: false },
  { name: "パソコン", viewport: { width: 1280, height: 800 }, isMobile: false },
];

type Side = "left" | "right";
/** ホイールの並び（Talk.tsx の WHEEL_CHIPS。0 はホーム）と、いつもの入口 */
const CHIPS: { index: number; label: string; side: Side; path: string; today?: boolean; entrance: (frame: Frame) => Promise<void> }[] = [
  { index: 1, label: "みんな", side: "right", path: "/minna", entrance: async () => {} },
  {
    index: 2,
    label: "今日の3人",
    side: "right",
    path: "/minna",
    today: true,
    entrance: (frame) => frame.getByRole("navigation", { name: "みんなの入口" }).getByRole("button", { name: /今日の/ }).click(),
  },
  { index: 3, label: "受信箱", side: "right", path: "/inbox", entrance: (frame) => frame.locator('.minna-dock a[href="/inbox"]').click() },
  { index: 4, label: "自習室", side: "right", path: "/study/room", entrance: (frame) => frame.locator('.minna-dock a[href="/study/room"]').click() },
  { index: 5, label: "校内の知恵", side: "right", path: "/chie", entrance: (frame) => frame.locator('.minna-dock a[href="/chie"]').click() },
  ...(["goals", "daily", "lookback", "settings"] as const).map((key, i) => ({
    index: 6 + i,
    label: ["頑張り", "日報・日記", "ふりかえり", "設定"][i],
    side: "left" as const,
    path: `/me?open=${key}`,
    entrance: (frame: Frame) => frame.locator(`a[data-tile="${key}"]`).click(),
  })),
];

async function frameOf(page: Page, side: Side): Promise<Frame> {
  const iframe = page.locator(`.device-row > .wide-panel[data-side=${side}] iframe`);
  // 列の中で開き直すと iframe が作り直されるので、取れるまで取り直す
  let frame: Frame | null = null;
  await expect(async () => {
    await expect(iframe).toBeAttached();
    frame = (await (await iframe.elementHandle())?.contentFrame()) ?? null;
    expect(frame).not.toBeNull();
    await frame!.waitForLoadState("load");
  }).toPass({ timeout: 15_000 });
  return frame!;
}

/** 開いた所：どちらの列（帯）に、どの画面が、今日の3人のモーダルつきで出ているか */
async function where(page: Page, side: Side) {
  const frame = await frameOf(page, side);
  const url = new URL(frame.url());
  url.searchParams.delete("today");
  const shown = isWideViewport(page) ? "column" : ((await page.locator(".device-row").getAttribute("data-pane")) ?? "");
  const today = await frame
    .getByRole("dialog", { name: "今日の3人" })
    .isVisible()
    .catch(() => false);
  return `${shown}|${url.pathname}${url.search}|today:${today}`;
}

async function ready(page: Page) {
  await page.waitForFunction(() => {
    const el = document.querySelector(".click-wheel");
    return el !== null && Object.keys(el).some((key) => key.startsWith("__reactProps"));
  });
  if (!isWideViewport(page)) await page.waitForFunction(() => document.documentElement.dataset.stripReady === "true", undefined, { timeout: 20_000 });
}

/** 輪をなぞって index 番目のチップを真ん中にし、離す */
async function openFromWheel(page: Page, index: number, label: string) {
  const wheel = (await page.locator(".click-wheel").boundingBox())!;
  const cx = wheel.x + wheel.width / 2;
  const cy = wheel.y + wheel.height / 2;
  const r = wheel.width * 0.44;
  const at = (deg: number) => ({ x: cx + r * Math.cos((deg * Math.PI) / 180), y: cy + r * Math.sin((deg * Math.PI) / 180) });
  await page.mouse.move(at(0).x, at(0).y);
  await page.mouse.down();
  await page.mouse.move(at(10).x, at(10).y);
  await page.mouse.move(at(20).x, at(20).y);
  for (let deg = 28; deg <= 20 + 24 * index; deg += 8) await page.mouse.move(at(deg).x, at(deg).y);
  // 指を止めると、最寄りの刻みへ寄って真ん中に座る。止まってから離すので滑らない
  await page.waitForTimeout(400);
  await expect(page.locator('.wheel-carousel-slot[data-center="true"] .chip-label')).toHaveText(label);
  await page.mouse.up();
}

for (const size of SIZES) {
  test.describe(size.name, () => {
    test.use({ viewport: size.viewport, isMobile: size.isMobile, hasTouch: size.isMobile, storageState: { cookies: PROMISE_SEEN, origins: [] } });

    test(`${size.name}：どのチップから開いても、いつもの入口から開いたときと同じ所に同じ出方で出る`, async ({ page }) => {
      test.setTimeout(300_000);
      await page.context().addCookies([
        { name: "koekata_person", value: "aoki", domain: "127.0.0.1", path: "/" },
        { name: "koekata_today_seen", value: "1", domain: "127.0.0.1", path: "/" },
      ]);
      const wide = isWideViewport(page);
      for (const chip of CHIPS) {
        const expected = `${wide ? "column" : chip.side}|${chip.path}|today:${Boolean(chip.today)}`;

        // いつもの入口：狭い画面は帯をその画面にして、3列はそのまま、列の中の帯やタイルを押す
        await page.goto(wide ? "/" : `/?pane=${chip.side}`);
        const frame = await frameOf(page, chip.side);
        await expect(frame.locator("main").first()).toBeVisible();
        await chip.entrance(frame);
        await expect.poll(() => where(page, chip.side), { message: `${chip.label}：いつもの入口`, timeout: 15_000 }).toBe(expected);
        await page.screenshot({ path: test.info().outputPath(`${size.name}-${chip.label}-入口.png`) });

        // ホイールから
        await page.goto("/");
        await ready(page);
        await openFromWheel(page, chip.index, chip.label);
        await expect.poll(() => where(page, chip.side), { message: `${chip.label}：ホイール`, timeout: 15_000 }).toBe(expected);
        // 外側の画面ごと移らない（話す画面の上に、帯や列として出る）
        expect(new URL(page.url()).pathname, `${chip.label}：外側は話す画面のまま`).toBe("/");
        await page.screenshot({ path: test.info().outputPath(`${size.name}-${chip.label}-ホイール.png`) });
      }
    });
  });
}
