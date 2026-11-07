import { expect, type Page, test } from "@playwright/test";
import { PROMISE_SEEN } from "./promise-seen";

// iPad でチップが大きすぎ、説明の一文が窓の下で切れた。どの大きさの画面でも、チップは窓の高さの 40% まで、説明は窓の中に収まる。
// 窓が低い画面（iPad 横・パソコン）でも、チップの名前の字は 14px より小さくしない（チップを横長にする）

const SIZES = [
  { name: "iPad 縦", viewport: { width: 820, height: 1180 }, isMobile: false },
  { name: "iPad 横", viewport: { width: 1180, height: 820 }, isMobile: false },
  { name: "iPhone", viewport: { width: 390, height: 844 }, isMobile: true },
  { name: "iPad mini", viewport: { width: 744, height: 1133 }, isMobile: false },
  { name: "パソコン", viewport: { width: 1280, height: 800 }, isMobile: false },
];

/** 真ん中と両わきのチップの名前の字の大きさ（px）と、1行に収まっているか */
async function labelSizes(page: Page) {
  return page.evaluate(() => {
    const center = document.querySelector('.wheel-carousel-slot[data-center="true"]')!.getBoundingClientRect();
    const middle = center.left + center.width / 2;
    return [...document.querySelectorAll<HTMLElement>(".wheel-carousel-slot")]
      .map((slot) => {
        const box = slot.getBoundingClientRect();
        const label = slot.querySelector<HTMLElement>(".chip-label")!;
        return {
          distance: Math.abs(box.left + box.width / 2 - middle),
          text: label.textContent ?? "",
          size: parseFloat(getComputedStyle(label).fontSize),
          fits: label.scrollWidth <= label.clientWidth + 0.5,
        };
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3);
  });
}

/** ホイールのチップの数（Talk.tsx の WHEEL_CHIPS） */
const CHIP_COUNT = 10;

async function measure(page: Page) {
  return page.evaluate(() => {
    const carousel = document.querySelector<HTMLElement>(".wheel-carousel")!;
    const lcd = carousel.parentElement!.getBoundingClientRect();
    const chip = document.querySelector('.wheel-carousel-slot[data-center="true"] .chip')!;
    const chipBox = chip.getBoundingClientRect();
    const caption = document.querySelector(".wheel-carousel-caption")!.getBoundingClientRect();
    return {
      label: chip.querySelector(".chip-label")?.textContent ?? "",
      lcd: { top: lcd.top, bottom: lcd.bottom, left: lcd.left, right: lcd.right, height: lcd.height },
      chipHeight: chipBox.height,
      caption: { top: caption.top, bottom: caption.bottom, left: caption.left, right: caption.right, height: caption.height },
    };
  });
}

for (const size of SIZES) {
  test.describe(size.name, () => {
    test.use({ viewport: size.viewport, isMobile: size.isMobile, hasTouch: size.isMobile, storageState: { cookies: PROMISE_SEEN, origins: [] } });

    test(`${size.name}：どのチップでも、チップは窓の高さの 40% まで、説明の一文は窓の中に収まる`, async ({ page }) => {
      await page.context().addCookies([
        { name: "koekata_person", value: "aoki", domain: "127.0.0.1", path: "/" },
        { name: "koekata_today_seen", value: "1", domain: "127.0.0.1", path: "/" },
      ]);
      await page.goto("/");
      const wheel = (await page.locator(".click-wheel").boundingBox())!;
      const cx = wheel.x + wheel.width / 2;
      const cy = wheel.y + wheel.height / 2;
      const r = wheel.width * 0.44;
      const at = (deg: number) => ({ x: cx + r * Math.cos((deg * Math.PI) / 180), y: cy + r * Math.sin((deg * Math.PI) / 180) });

      await page.mouse.move(at(0).x, at(0).y);
      await page.mouse.down();
      await page.mouse.move(at(10).x, at(10).y);
      await page.mouse.move(at(20).x, at(20).y);
      await expect(page.locator(".wheel-carousel")).toHaveAttribute("data-state", "turning");

      const seen = new Set<string>();
      let deg = 20;
      for (let i = 0; i < CHIP_COUNT; i++) {
        // 指を止めると、最寄りの刻みへ寄って真ん中に座る
        await page.waitForTimeout(400);
        const m = await measure(page);
        seen.add(m.label);
        await page.screenshot({ path: test.info().outputPath(`${size.name}-${i}-${m.label}.png`) });
        expect.soft(m.chipHeight, `${m.label}：チップの高さ ${m.chipHeight} が窓 ${m.lcd.height} の 40% まで`).toBeLessThanOrEqual(m.lcd.height * 0.4 + 0.5);
        expect.soft(m.caption.height, `${m.label}：説明が出ている`).toBeGreaterThan(0);
        expect
          .soft(
            m.caption.top >= m.lcd.top - 0.5 && m.caption.bottom <= m.lcd.bottom + 0.5 && m.caption.left >= m.lcd.left - 0.5 && m.caption.right <= m.lcd.right + 0.5,
            `${m.label}：説明 ${JSON.stringify(m.caption)} が窓 ${JSON.stringify(m.lcd)} の中`,
          )
          .toBe(true);
        // 真ん中と両わきの名前の字は 14px 以上で、1行に収まる
        for (const label of await labelSizes(page)) {
          expect.soft(label.size, `${m.label} のとき「${label.text}」の字 ${label.size}px が 14px 以上`).toBeGreaterThanOrEqual(14);
          expect.soft(label.fits, `${m.label} のとき「${label.text}」が1行に収まる`).toBe(true);
        }
        for (const step of [8, 16, 24]) await page.mouse.move(at(deg + step).x, at(deg + step).y);
        deg += 24;
      }
      expect(seen.size).toBe(CHIP_COUNT);

      // 真ん中のマイクの上で離して、何も開かずにやめる
      await page.mouse.move(cx, cy, { steps: 2 });
      await page.mouse.up();
      await expect(page.locator(".wheel-carousel")).toHaveAttribute("data-state", "idle");
    });
  });
}
