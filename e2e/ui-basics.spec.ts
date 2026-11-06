import { expect, test } from "@playwright/test";

const PAGES = ["/", "/walk", "/minna", "/me", "/today", "/chie", "/chie/new", "/inbox", "/teams", "/daily", "/daily/received", "/study", "/lookback", "/soudan", "/people/noda"];
const SUB_PAGES = PAGES.filter((path) => !["/", "/minna", "/me"].includes(path));

function smallTargets() {
  const small: string[] = [];
  document.querySelectorAll("a, button, select, summary").forEach((el) => {
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    // 文章の中のリンクは、行の高さで押す
    if (el.tagName === "A" && el.closest("p, li, small") && !el.closest(".quick-links, .season-links, .chie-links")) return;
    if (el.closest(".teams")) return;
    if (box.height < 43.5) small.push(`${el.tagName}:${(el.textContent ?? "").trim().slice(0, 16)} ${Math.round(box.height)}`);
  });
  return small;
}

test("文字をとても大きくしても、どの画面も横にあふれない", async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, baseURL: test.info().project.use.baseURL });
  await context.addCookies([
    { name: "koekata_size", value: "xlarge", domain: "127.0.0.1", path: "/" },
    { name: "koekata_theme", value: "pop", domain: "127.0.0.1", path: "/" },
  ]);
  const page = await context.newPage();
  for (const path of PAGES) {
    await page.goto(path);
    const wide = await page.evaluate(() =>
      [...document.querySelectorAll("body *")]
        .filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1 && !el.closest("[aria-hidden=true]"))
        .slice(0, 4)
        .map((el) => `${el.tagName}.${el.getAttribute("class")}`),
    );
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${path} ${wide.join(" ")}`).toBe(0);
  }
  await context.close();
});

test("もどるは画面の先頭に「‹ 行き先」の形であり、下のタブとデモ用の切り替えは出ない", async ({ page }) => {
  for (const path of SUB_PAGES) {
    await page.goto(path);
    const back = page.locator(".back-link");
    await expect(back, path).toHaveCount(1);
    await expect(back, path).toHaveText(/^‹ /);
    const box = await back.boundingBox();
    expect(box?.y, path).toBeLessThan(120);
    // 0-1q：古い形の目印。使う人の切り替えは「履歴と設定」の「設定」の中だけ
    await expect(page.locator(".demo-switcher"), path).toHaveCount(0);
    await expect(page.locator(".bottom-nav"), path).toHaveCount(0);
  }
});

test("言葉は平易で、ゴールやアシストが画面に出ない", async ({ page }) => {
  for (const path of ["/inbox", "/me", "/teams"]) {
    await page.goto(path);
    const text = await page.locator("body").innerText();
    expect(text, path).not.toMatch(/ゴール|アシスト|パスする/);
  }
});
