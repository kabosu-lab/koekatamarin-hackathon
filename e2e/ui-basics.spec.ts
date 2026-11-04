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

for (const theme of ["pop", "modern"]) {
  test(`${theme}：押す場所が44px以上で、タブにアイコンと文字がある`, async ({ browser }) => {
    test.setTimeout(120_000);
    const context = await browser.newContext({ viewport: { width: 412, height: 839 }, reducedMotion: "reduce", baseURL: test.info().project.use.baseURL });
    await context.addCookies([{ name: "koekata_theme", value: theme, domain: "127.0.0.1", path: "/" }]);
    const page = await context.newPage();
    for (const path of PAGES) {
      await page.goto(path);
      expect(await page.evaluate(smallTargets), path).toEqual([]);
    }
    const tabs = page.getByRole("navigation", { name: "画面の切り替え" }).getByRole("link");
    await expect(tabs).toHaveCount(3);
    for (const name of ["話す", "みんな", "じぶん"]) {
      const tab = page.getByRole("link", { name, exact: true }).last();
      await expect(tab.locator("svg")).toHaveCount(1);
    }
    await context.close();
  });
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

test("もどるは画面の先頭にあり、デモ用の切り替えは一番下に1つだけ", async ({ page }) => {
  for (const path of SUB_PAGES) {
    await page.goto(path);
    const back = page.locator(".back-link");
    await expect(back, path).toHaveCount(1);
    const box = await back.boundingBox();
    expect(box?.y, path).toBeLessThan(120);
    await expect(page.locator(".demo-switcher"), path).toHaveCount(1);
  }
});

test("最初の画面は話すと書くが主役で、音ときせかえは設定の中にある", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "話しかける" })).toBeInViewport();
  await expect(page.getByRole("button", { name: "文字で書く" })).toBeInViewport();
  await expect(page.getByRole("button", { name: "音 オン" })).toBeHidden();
  await page.getByText("設定", { exact: true }).click();
  await expect(page.getByRole("button", { name: "音 オン" })).toBeVisible();
});

test("言葉は平易で、ゴールやアシストが画面に出ない", async ({ page }) => {
  for (const path of ["/inbox", "/me", "/teams"]) {
    await page.goto(path);
    const text = await page.locator("body").innerText();
    expect(text, path).not.toMatch(/ゴール|アシスト|パスする/);
  }
});
