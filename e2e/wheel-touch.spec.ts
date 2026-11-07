import { type CDPSession, expect, type Page, test } from "@playwright/test";
import { isWideViewport } from "./helpers";
import { PROMISE_SEEN } from "./promise-seen";

// 0-3n：iPad の Safari で輪をなぞっても動かなかった。指（タッチ）で輪をなぞると、カルーセルが開き、離すと選んだ画面へ移る。
// page.touchscreen は1点を叩くだけなので、CDP の Input.dispatchTouchEvent で指を置いて動かして離す（ブラウザが pointer も作る）

const SIZES = [
  { name: "iPad 縦", viewport: { width: 820, height: 1180 } },
  { name: "iPad 横", viewport: { width: 1180, height: 820 } },
  { name: "iPhone", viewport: { width: 390, height: 844 } },
];

/** 試用のサーバー（playwright.config.ts の試用と同じ、次の番号） */
const TRIAL_URL = `http://127.0.0.1:${Number(process.env.KOEKATA_E2E_PORT ?? 3100) + 1}`;

/** 今日の3人が開いた。横の3列では外側の URL は変わらず、右の列の中で開く（0-2y） */
async function expectOpened(page: Page) {
  if (!isWideViewport(page)) return expect(page).toHaveURL(/\/today/);
  await expect
    .poll(async () => (await (await page.locator(".wide-panel[data-side=right] iframe").elementHandle())?.contentFrame())?.url() ?? "")
    .toMatch(/\/today/);
}

async function touch(cdp: CDPSession, type: "touchStart" | "touchMove" | "touchEnd", x: number, y: number) {
  await cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1, radiusX: 8, radiusY: 8, force: 1 }] });
}

/** 輪の上を指でなぞる。真ん中に来たチップの名前を返し、離す */
async function swipeWheel(page: Page, degrees: number) {
  const wheel = page.locator(".click-wheel");
  await expect(wheel).toBeVisible();
  // 準備（hydration）ができる前の指は届かない
  await page.waitForFunction(() => {
    const el = document.querySelector(".click-wheel");
    return el !== null && Object.keys(el).some((key) => key.startsWith("__reactProps"));
  });
  const box = (await wheel.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  // マイク（直径 58〜76%）の外、輪の縁の内側
  const r = box.width * 0.44;
  const at = (deg: number) => ({ x: cx + r * Math.cos((deg * Math.PI) / 180), y: cy + r * Math.sin((deg * Math.PI) / 180) });

  // 指を置く場所の上に何が重なっているか（記録）
  const stack = await page.evaluate(({ x, y }) => {
    const describe = (el: Element) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).join(".") : ""}`;
    return { top: describe(document.elementFromPoint(x, y)!), all: document.elementsFromPoint(x, y).slice(0, 6).map(describe) };
  }, at(0));
  test.info().annotations.push({ type: "輪の上", description: `${stack.top} ← ${stack.all.join(" / ")}` });

  const cdp = await page.context().newCDPSession(page);
  await touch(cdp, "touchStart", at(0).x, at(0).y);
  for (let deg = 4; deg <= degrees; deg += 4) await touch(cdp, "touchMove", at(deg).x, at(deg).y);
  await expect(page.locator(".wheel-carousel")).toHaveAttribute("data-state", "turning");
  // 指を止めると、最寄りの刻みへ寄って真ん中に座る
  await page.waitForTimeout(400);
  const label = (await page.locator('.wheel-carousel-slot[data-center="true"] .chip-label').textContent()) ?? "";
  await page.screenshot({ path: test.info().outputPath(`なぞり中.png`) });
  await touch(cdp, "touchEnd", at(degrees).x, at(degrees).y);
  await cdp.detach();
  return { label, stack };
}

for (const size of SIZES) {
  test.describe(size.name, () => {
    test.use({ viewport: size.viewport, isMobile: true, hasTouch: true, storageState: { cookies: PROMISE_SEEN, origins: [] } });

    for (const who of ["生徒", "先生"] as const) {
      test(`${size.name}・${who}：輪を指でなぞるとチップが出て、離すと選んだ画面へ移る`, async ({ page }) => {
        if (who === "生徒") await page.context().addCookies([{ name: "koekata_person", value: "aoki", domain: "127.0.0.1", path: "/" }]);
        await page.goto("/");
        const { label, stack } = await swipeWheel(page, 52);
        expect(stack.top, "指を置く場所のいちばん上は輪").toMatch(/^div\.click-wheel/);
        // 2つ先（24度ずつ）：みんな → 今日の3人
        expect(label).toBe("今日の3人");
        await expectOpened(page);
        await page.screenshot({ path: test.info().outputPath(`${size.name}-${who}-開いた.png`) });
      });
    }

    test(`${size.name}・試用の先生用：輪を指でなぞると画面が移る`, async ({ page }) => {
      await page.goto(`${TRIAL_URL}/access`);
      await page.getByLabel("合言葉").fill("test-code");
      await page.getByRole("button", { name: "入る" }).click();
      await expect(page.locator(".talk")).toBeVisible();
      await page.getByRole("dialog", { name: "試用版について" }).getByRole("button", { name: "わかった" }).click();
      const { label } = await swipeWheel(page, 52);
      expect(label).toBe("今日の3人");
      await expectOpened(page);
    });
  });
}

test.describe("子から始まる指", () => {
  test.use({ viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true, storageState: { cookies: PROMISE_SEEN, origins: [] } });

  // Safari では、輪の中の子（目盛りの点など）が指の target になることがある。子から始まっても輪のなぞりとして扱う
  test("目盛りの点から始まった指でも輪が回り、マイクから始まった指では回らない", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => {
      const el = document.querySelector(".click-wheel");
      return el !== null && Object.keys(el).some((key) => key.startsWith("__reactProps"));
    });
    const drag = (from: string) =>
      page.evaluate((selector) => {
        const wheel = document.querySelector<HTMLElement>(".click-wheel")!;
        const box = wheel.getBoundingClientRect();
        const cx = box.left + box.width / 2;
        const cy = box.top + box.height / 2;
        const r = box.width * 0.44;
        const at = (deg: number) => ({ clientX: cx + r * Math.cos((deg * Math.PI) / 180), clientY: cy + r * Math.sin((deg * Math.PI) / 180) });
        const init = { bubbles: true, cancelable: true, pointerId: 7, pointerType: "touch", isPrimary: true };
        document.querySelector(selector)!.dispatchEvent(new PointerEvent("pointerdown", { ...init, ...at(0) }));
        for (let deg = 4; deg <= 40; deg += 4) wheel.dispatchEvent(new PointerEvent("pointermove", { ...init, ...at(deg) }));
        return document.documentElement.dataset.wheeling ?? "";
      }, from);
    expect(await drag(".device-mic")).toBe("");
    await page.evaluate(() => document.querySelector(".click-wheel")!.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 7, pointerType: "touch" })));
    // 輪の中の子（マイク以外）から始まった指も、輪のなぞりとして扱う
    await page.evaluate(() => {
      const child = document.createElement("span");
      child.className = "probe-child";
      child.style.cssText = "position:absolute;inset:0;pointer-events:none";
      document.querySelector(".click-wheel")!.appendChild(child);
    });
    expect(await drag(".click-wheel > .probe-child")).toBe("true");
  });
});
