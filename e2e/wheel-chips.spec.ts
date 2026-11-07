import { expect, type Page, test } from "@playwright/test";
import { PROMISE_SEEN } from "./promise-seen";

// 0-2o の続き：どの幅でも、ホイールのチップが崩れない。全部のチップを1つずつ真ん中にして確かめる

const SIZES = [
  { name: "iPhone", viewport: { width: 390, height: 844 }, isMobile: true },
  { name: "iPad 横", viewport: { width: 1180, height: 820 }, isMobile: false },
  { name: "パソコン", viewport: { width: 1280, height: 800 }, isMobile: false },
];

/** ホイールのチップの数（Talk.tsx の WHEEL_CHIPS） */
const CHIP_COUNT = 10;

type Check = {
  label: string;
  labelFits: boolean;
  labelOneLine: boolean;
  artInside: boolean;
  opacities: string[];
  captionBackground: string;
};

async function measure(page: Page): Promise<Check> {
  return page.evaluate(() => {
    const center = document.querySelector<HTMLElement>('.wheel-carousel-slot[data-center="true"]')!;
    const chip = center.querySelector<HTMLElement>(".chip")!;
    const label = chip.querySelector<HTMLElement>(".chip-label")!;
    const art = chip.querySelector<HTMLElement>(".chip-art")!;
    const box = chip.getBoundingClientRect();
    const artBox = art.getBoundingClientRect();
    const lineHeight = parseFloat(getComputedStyle(label).lineHeight) || parseFloat(getComputedStyle(label).fontSize) * 1.2;
    // 真ん中と、その両わき（輪の中で見えているチップ）
    const slots = [...document.querySelectorAll<HTMLElement>(".wheel-carousel-slot")].filter((slot) => {
      const rect = slot.getBoundingClientRect();
      return Math.abs(rect.left + rect.width / 2 - (box.left + box.width / 2)) < box.width * 1.5;
    });
    return {
      label: label.textContent ?? "",
      labelFits: label.scrollWidth <= label.clientWidth + 0.5,
      labelOneLine: label.getBoundingClientRect().height <= lineHeight * 1.3,
      artInside: artBox.top >= box.top - 0.5 && artBox.bottom <= box.bottom + 0.5 && artBox.left >= box.left - 0.5 && artBox.right <= box.right + 0.5,
      opacities: slots.map((slot) => getComputedStyle(slot).opacity),
      captionBackground: getComputedStyle(document.querySelector(".wheel-carousel-caption")!).backgroundColor,
    };
  });
}

for (const size of SIZES) {
  test.describe(size.name, () => {
    test.use({ viewport: size.viewport, isMobile: size.isMobile, hasTouch: size.isMobile, storageState: { cookies: PROMISE_SEEN, origins: [] } });

    test(`${size.name}：どのチップを真ん中にしても、名前は1行、絵は箱の中、チップは不透明、説明に下地`, async ({ page }) => {
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
        const check = await measure(page);
        seen.add(check.label);
        await page.screenshot({ path: test.info().outputPath(`${size.name}-${i}-${check.label}.png`) });
        expect.soft(check.labelFits, `${check.label}：名前が幅に収まる`).toBe(true);
        expect.soft(check.labelOneLine, `${check.label}：名前が1行`).toBe(true);
        expect.soft(check.artInside, `${check.label}：絵がチップの中`).toBe(true);
        expect.soft(check.opacities.every((o) => o === "1"), `${check.label}：チップが不透明 ${check.opacities.join(",")}`).toBe(true);
        expect.soft(check.captionBackground, `${check.label}：説明に下地`).not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
        for (const step of [8, 16, 24]) await page.mouse.move(at(deg + step).x, at(deg + step).y);
        deg += 24;
      }
      expect(seen.size).toBe(CHIP_COUNT);
      expect(seen.has("自習室")).toBe(true);

      // 真ん中のマイクの上で離して、何も開かずにやめる
      await page.mouse.move(cx, cy, { steps: 2 });
      await page.mouse.up();
      await expect(page.locator(".wheel-carousel")).toHaveAttribute("data-state", "idle");
    });
  });
}
