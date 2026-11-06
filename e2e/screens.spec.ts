import { expect, test, type Page } from "@playwright/test";

/**
 * 0-1q：すべての画面を iPhone の幅と iPad の縦・横で撮り、古い形が残っていないかを確かめる。
 * 写真は test-results に残る（見た目の取り違えを人の目で見つけるため）。棚卸しの表は docs/screens.md。
 */
const VIEWPORTS = [
  { name: "iPhone", width: 390, height: 844 },
  { name: "iPad縦", width: 820, height: 1180 },
  { name: "iPad横", width: 1180, height: 820 },
] as const;

/** 3枚の画面（話す・みんな・履歴と設定）。左右のスワイプと点が入口で、戻る印は持たない */
const MAIN_SCREENS = ["/", "/minna", "/me"];

/** 奥の画面。どれも左上に戻る印を1つ持つ */
const SUB_SCREENS = [
  "/sakura",
  "/today",
  "/inbox",
  "/teams",
  "/chie",
  "/chie/new",
  "/study/room",
  "/walk",
  "/daily",
  "/daily/received",
  "/lookback",
  // /portfolio は「ふりかえり」のタイル（/me?open=lookback）へ送る（0-2b）
  "/people/noda",
  "/soudan",
  "/yousu",
  "/koho",
];

/** Teams のタブに置く画面。アプリの中からは開かず、戻る印もない */
const EMBED_SCREENS = ["/tab"];

/**
 * 共通の外枠（src/app/ui/PageShell.tsx）を使わない奥の画面。
 * 桜は「みんな」の担当が作り直し中。校内チャネルは Teams に似せた画面なので外枠を持たない。
 * （/study は自習室 /study/room へ送るだけなので、ここには並べない）
 */
const OWN_FRAME = ["/sakura", "/teams"];

/** トロフィーの小さな知らせは押すとコレクションへ移るので、押さずに Esc で閉じる */
async function closeMoments(page: Page) {
  const toast = page.locator(".trophy-toast");
  if (await toast.isVisible().catch(() => false)) await page.keyboard.press("Escape");
}

async function shoot(page: Page, path: string, viewport: string) {
  const name = `${viewport}-${path === "/" ? "talk" : path.slice(1).replaceAll("/", "_")}.png`;
  // 入ってくる動き（200ms）の途中で撮らないよう、動きは終わった形で撮る
  await page.screenshot({ path: test.info().outputPath(name), fullPage: true, animations: "disabled" });
}

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.name}（${viewport.width}×${viewport.height}）`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
    });

    test("どの画面にも、下の3つのタブとデモ用の切り替えが出ず、横にはみ出さない", async ({ page }) => {
      test.setTimeout(240_000);
      for (const path of [...MAIN_SCREENS, ...SUB_SCREENS, ...EMBED_SCREENS]) {
        await page.goto(path);
        await closeMoments(page);
        await expect(page.locator(".bottom-nav"), path).toHaveCount(0);
        await expect(page.locator("body > .demo-switcher"), path).toHaveCount(0);
        await expect(page.getByText("デモ用：使う人"), path).toHaveCount(0);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, path).toBe(0);
        await shoot(page, path, viewport.name);
      }
    });

    test("奥の画面は同じ形：左上に戻る印が1つ、見出しが1つ、文は途中で切れない", async ({ page }) => {
      test.setTimeout(240_000);
      for (const path of SUB_SCREENS) {
        await page.goto(path);
        await closeMoments(page);
        await expect(page.locator("h1"), path).toHaveCount(1);
        const back = page.locator(".back-link");
        await expect(back, path).toHaveCount(1);
        await expect(back, path).toHaveText(/^‹ /);
        const box = await back.boundingBox();
        expect(box?.y, path).toBeLessThan(120);
        if (OWN_FRAME.includes(path)) continue;
        await expect(page.locator("main.page-shell"), path).toHaveCount(1);
        // 文が途中で切れる箱がない（行の数で切る指定を使わない）
        const clamped = await page.evaluate(() =>
          [...document.querySelectorAll("main *")]
            .filter((el) => {
              const style = getComputedStyle(el);
              return style.webkitLineClamp !== "none" && style.webkitLineClamp !== "";
            })
            .map((el) => `${el.tagName}.${el.getAttribute("class")}`),
        );
        expect(clamped, path).toEqual([]);
      }
    });
  });
}

/** 0-2b：履歴と設定は、窓・6枚のタイル・「これまで」の帯・点が、スクロールなしで全部見える */
const FIT_VIEWPORTS = [
  { name: "iPhone", width: 390, height: 844 },
  { name: "iPad縦", width: 768, height: 1024 },
  { name: "iPad横", width: 1024, height: 768 },
  { name: "iPad縦（大）", width: 820, height: 1180 },
  { name: "iPad横（大）", width: 1180, height: 820 },
] as const;

for (const viewport of FIT_VIEWPORTS) {
  test(`履歴と設定は ${viewport.name}（${viewport.width}×${viewport.height}）でスクロールなしにタイル6枚と帯が見える`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/me");
    await closeMoments(page);
    await expect(page.locator(".me-tiles a")).toHaveCount(6);
    const fit = await page.evaluate(() => {
      const body = document.querySelector(".device-body");
      const bottomOf = (selector: string) =>
        Math.max(...[...document.querySelectorAll(selector)].map((el) => el.getBoundingClientRect().bottom));
      return {
        page: (document.scrollingElement?.scrollHeight ?? 0) - innerHeight,
        inner: body ? body.scrollHeight - body.clientHeight : 0,
        tiles: bottomOf(".me-tiles a") - innerHeight,
        band: bottomOf(".me-so-far") - innerHeight,
        dots: bottomOf(".swipe-mark") - innerHeight,
      };
    });
    expect(fit.page, "ページ").toBeLessThanOrEqual(0);
    expect(fit.inner, "中身の入れ物").toBeLessThanOrEqual(1);
    expect(fit.tiles, "タイル").toBeLessThanOrEqual(0);
    expect(fit.band, "帯").toBeLessThanOrEqual(0);
    expect(fit.dots, "点").toBeLessThanOrEqual(0);
    await page.screenshot({ path: test.info().outputPath(`fit-${viewport.width}x${viewport.height}-me.png`), animations: "disabled" });
  });
}

/**
 * 0-2i：夜の画面の確認（11/7）で見つかった崩れが戻らないことを、3つの幅で確かめる。
 * 決まりは 0-1d：文を切らない・はみ出さない。
 */

/** 文の行の数。要素の中の文字（アイコンは数えない）が何行に並んでいるか */
async function lineCount(locator: import("@playwright/test").Locator) {
  return locator.evaluate((el) => {
    const tops = new Set<number>();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) if (rect.width > 0) tops.add(Math.round(rect.top));
    }
    return tops.size;
  });
}

/** 箱から文がはみ出していない（横にも縦にも） */
async function fitsInside(locator: import("@playwright/test").Locator) {
  return locator.evaluate((el) => el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1);
}

for (const viewport of VIEWPORTS) {
  test.describe(`0-2i の崩れ ${viewport.name}（${viewport.width}×${viewport.height}）`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
    });

    test("(1)(5) 設定：「デモ用」の言葉がなく、カードは1列で、ボタンの言葉は1行で収まる", async ({ page }) => {
      await page.goto("/me?open=settings");
      await closeMoments(page);
      await expect(page.getByText("デモ用")).toHaveCount(0);
      await expect(page.getByLabel("試す人を切り替える")).toBeVisible();
      // カードを細い2列に押し込まない：どのカードも窓の下の幅いっぱい
      const widths = await page.locator(".device-window .home > .card, .device-window .home > section.card").evaluateAll((cards) =>
        cards.map((card) => Math.round(card.getBoundingClientRect().width)),
      );
      expect(widths.length).toBeGreaterThan(2);
      expect(Math.max(...widths) - Math.min(...widths), widths.join(",")).toBeLessThanOrEqual(2);
      const memory = page.getByRole("region", { name: /覚えていること/ }).first();
      if (await memory.count()) expect((await memory.boundingBox())!.width).toBeGreaterThanOrEqual(Math.max(...widths) - 2);
      for (const button of await page.locator(".device-window .card .row > button").all()) {
        if (!(await button.isVisible())) continue;
        const text = await button.innerText();
        expect(await lineCount(button), text).toBe(1);
        expect(await fitsInside(button), text).toBe(true);
      }
    });

    test("(3)(10) 話す：マイクのボタンの文字は1行。「校内の知恵を探す」は「新しく話す」の下の真ん中", async ({ page }) => {
      await page.goto("/");
      await closeMoments(page);
      const mic = page.locator(".device-mic");
      await expect(mic).toBeVisible();
      expect(await lineCount(mic)).toBe(1);
      expect(await fitsInside(mic)).toBe(true);
      const input = page.getByLabel("パートナーに書く");
      await input.fill("こんにちは");
      await input.press("Enter");
      await expect(page.locator(".bubble.assistant:not(.waiting)")).toHaveCount(1);
      const find = page.locator(".log > .find-knowledge");
      const fresh = page.locator(".new-talk");
      if ((await find.count()) && (await fresh.count())) {
        const a = (await find.boundingBox())!;
        const b = (await fresh.boundingBox())!;
        expect(Math.abs(a.x + a.width / 2 - (b.x + b.width / 2))).toBeLessThanOrEqual(4);
      }
    });

    test("(4) 履歴と設定：タイルの名前は途中で折れない（広い画面では左の欄の中も）", async ({ page }) => {
      await page.goto("/me");
      await closeMoments(page);
      const labels = page.locator(".me-tile-label");
      await expect(labels).toHaveCount(6);
      for (const label of await labels.all()) {
        const text = await label.innerText();
        expect(await lineCount(label), text).toBe(1);
        const box = (await label.boundingBox())!;
        const tile = (await label.locator("xpath=..").boundingBox())!;
        expect(box.width, text).toBeLessThanOrEqual(tile.width + 1);
      }
      if (viewport.width >= 1100) {
        await page.goto("/");
        const panel = page.frameLocator('iframe[title="履歴と設定"]').locator(".me-tile-label");
        await expect(panel).toHaveCount(6);
        for (const label of await panel.all()) expect(await lineCount(label), await label.innerText()).toBe(1);
      }
    });

    test("(6) 自習室：景色・タイマー・曲のカードは同じ幅", async ({ page }) => {
      await page.goto("/study/room");
      const widths = await page.locator("main.room-page > .card").evaluateAll((cards) =>
        cards.map((card) => Math.round(card.getBoundingClientRect().width)),
      );
      expect(widths.length).toBeGreaterThanOrEqual(3);
      expect(Math.max(...widths) - Math.min(...widths), widths.join(",")).toBeLessThanOrEqual(1);
    });

    test("(2)(7) みんな：春の見通しの吹き出しは説明の文に重ならず、下の帯の名前は「…」で切れない", async ({ page }) => {
      // 広い画面では、話す画面の右の欄の中の「みんな」を見る
      const wide = viewport.width >= 1100;
      await page.goto(wide ? "/" : "/minna");
      const frame = wide ? page.frameLocator('iframe[title="みんな"]') : page;
      const card = frame.locator(".koekata-forecast-card");
      await expect(card).toBeVisible();
      const cardBox = (await card.boundingBox())!;
      const storyBox = (await frame.locator(".minna-sakura-story").boundingBox())!;
      expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(storyBox.y);
      for (const item of await frame.locator(".minna-dock-item > span:not(.minna-dock-badge)").all()) {
        const text = await item.innerText();
        expect(await fitsInside(item), text).toBe(true);
        expect(await lineCount(item), text).toBeLessThanOrEqual(2);
      }
    });

    test("(9) 左右に欄が出ているときは、下のスワイプの印と点を出さない", async ({ page }) => {
      await page.goto("/");
      const mark = page.locator(".talk .swipe-mark");
      if (viewport.width >= 1100) {
        await expect(page.frameLocator('iframe[title="みんな"]').getByRole("heading", { name: "みんな" })).toBeVisible();
        await expect(mark).toBeHidden();
      } else {
        await expect(mark).toBeVisible();
      }
    });
  });
}
