import { expect, test } from "@playwright/test";
import { openScreen } from "./helpers";

/**
 * 0-2s：自習室は人が何人いても1画面に収まり、スクロールが出ない。
 * 人数は `?people=` で作る（`?time=` と同じく見た目だけ。記録は増やさない）。
 */
const VIEWPORTS = [
  { name: "iPhone", width: 390, height: 844 },
  { name: "iPad横", width: 1180, height: 820 },
] as const;

const SEATS = 12;

for (const viewport of VIEWPORTS) {
  for (const people of [1, 3, 12, 30]) {
    test(`${viewport.name}（${viewport.width}×${viewport.height}）で ${people} 人のとき、スクロールが出ず、札と帯が景色の中に重なる`, async ({ page }, info) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      // 0-2y (6)：横向きでは、自習室は3列の右の列の中に開く。列の中で確かめる
      const screen = await openScreen(page, `/study/room?time=morning&people=${people}`);
      const stage = screen.locator(".room-stage");
      await expect(stage).toBeVisible();
      await expect(screen.locator(".room-scene .study-buddy")).toHaveCount(Math.min(people, SEATS));
      // 入ってくる動き（200ms）が終わってから測る
      await page.waitForTimeout(400);

      const sizes = await screen.evaluate(() =>
        [document.documentElement, document.body, document.querySelector("main"), document.querySelector(".room-stage"), document.querySelector(".room-floor")].map(
          (element) => ({
            name: element?.className || element?.tagName || "?",
            scroll: element?.scrollHeight ?? -1,
            client: element?.clientHeight ?? -1,
            scrollX: element?.scrollWidth ?? -1,
            clientX: element?.clientWidth ?? -1,
          }),
        ),
      );
      for (const size of sizes) {
        expect(size.scroll, `${size.name} の縦`).toBeLessThanOrEqual(size.client);
        expect(size.scrollX, `${size.name} の横`).toBeLessThanOrEqual(size.clientX);
      }

      // 見出しは「自習室」の1行
      const heading = screen.getByRole("heading", { level: 1 });
      await expect(heading).toHaveText("自習室");
      const headBox = (await heading.boundingBox())!;
      expect(headBox.height).toBeLessThan(40);

      // 上の端に人数と曲の札、下の端にタイマーの帯。どれも景色の中
      const box = (await stage.boundingBox())!;
      const inside = async (selector: string) => {
        const part = (await screen.locator(selector).first().boundingBox())!;
        expect(part.x, selector).toBeGreaterThanOrEqual(box.x - 0.5);
        expect(part.y, selector).toBeGreaterThanOrEqual(box.y - 0.5);
        expect(part.x + part.width, selector).toBeLessThanOrEqual(box.x + box.width + 0.5);
        expect(part.y + part.height, selector).toBeLessThanOrEqual(box.y + box.height + 0.5);
        return part;
      };
      await expect(screen.locator(".room-stage .study-count")).toHaveText(`いま ${people} 人が勉強しています`);
      const count = await inside(".room-stage .study-count");
      const music = await inside(".room-music-change");
      const band = await inside(".room-band");
      expect(count.y - box.y).toBeLessThan(24);
      expect(music.y - box.y).toBeLessThan(24);
      expect(box.y + box.height - (band.y + band.height)).toBeLessThan(24);
      await expect(screen.getByRole("region", { name: "タイマー" }).getByRole("button", { name: /25分/ })).toBeVisible();

      // 席はすべて景色の中。12人を超えた分は「ほか N人」にまとめる
      for (const seat of await screen.locator(".room-scene .room-table").all()) {
        const seatBox = (await seat.boundingBox())!;
        expect(seatBox.x).toBeGreaterThanOrEqual(box.x - 0.5);
        expect(seatBox.x + seatBox.width).toBeLessThanOrEqual(box.x + box.width + 0.5);
        expect(seatBox.y + seatBox.height).toBeLessThanOrEqual(box.y + box.height + 0.5);
      }
      if (people > SEATS) {
        await expect(screen.locator(".room-more")).toHaveText(`ほか ${people - SEATS}人`);
        await inside(".room-more");
      } else {
        await expect(screen.locator(".room-more")).toHaveCount(0);
      }
      await page.screenshot({ path: info.outputPath(`${viewport.width}-${people}.png`) });
    });
  }
}

test("人が増えるほど、キャラクターは小さくなる", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const widths: number[] = [];
  for (const people of [1, 3, 12]) {
    await page.goto(`/study/room?people=${people}`);
    widths.push((await page.locator(".room-scene .study-buddy").first().boundingBox())!.width);
  }
  expect(widths[1]).toBeLessThan(widths[0]);
  expect(widths[2]).toBeLessThan(widths[1]);
});
