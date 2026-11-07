import { expect, type Frame, type Locator, type Page, test } from "@playwright/test";
import { openScreen } from "./helpers";
import { PROMISE_SEEN } from "./promise-seen";

// 0-3p：今日の3人はきっちり3人。まだ反応のない投稿も見た目を変えずに混ぜ、払うと消え、返事で消え、3人とも済むとおしまいと次のおすすめ
// その日はじめての「みんな」で開くよう、今日の3人を出した印（koekata_today_seen）は付けない
test.use({ storageState: { cookies: PROMISE_SEEN.filter((cookie) => cookie.name !== "koekata_today_seen"), origins: [] } });

/** 担任のクラスに生徒（中村さん）のいる先生で見る */
const TEACHER = "kawamura";

async function asTeacher(page: Page) {
  await page.context().addCookies([{ name: "koekata_person", value: TEACHER, domain: "127.0.0.1", path: "/" }]);
}

/** カードの上（札のあたり）で、指を横へ払う */
async function swipe(page: Page, card: Locator, dx: number) {
  const box = (await card.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + 12;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(x + (dx * i) / 8, y);
  await page.mouse.up();
}

for (const size of [
  { name: "iPhone", width: 390, height: 844 },
  { name: "iPad 縦", width: 820, height: 1180 },
  { name: "iPad 横", width: 1180, height: 820 },
]) {
  test(`${size.name}：今日の3人は3枚で同じ人がなく、混ぜた投稿も同じ見た目。払うと消え、返事で消え、3人とも済むとおしまいと次のおすすめ`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await asTeacher(page);
    const screen: Page | Frame = await openScreen(page, "/minna");
    const modal = screen.getByRole("dialog", { name: "今日の3人" });
    await expect(modal).toBeVisible();
    const count = modal.getByRole("img", { name: /枚目/ });
    // 3人（と、おしまいの1枚）。黄色の別枠や「まだ反応なし」の札はない
    await expect(count).toHaveAttribute("aria-label", "1 枚目（全 4 枚）");
    await expect(screen.locator(".quiet-note")).toHaveCount(0);
    await expect(modal.getByText(/まだ反応/)).toHaveCount(0);
    const cards = modal.locator("article.minna-today-card");
    await expect(cards).toHaveCount(3);
    const names = await cards.evaluateAll((list) => list.map((card) => card.getAttribute("aria-label")));
    expect(new Set(names).size, names.join("、")).toBe(3);
    // どのカードも同じ形（同じ札・同じ作り。件名の種類の色分け data-card は投稿の種類によるので比べない）
    const looks = await cards.evaluateAll((list) =>
      list.map((card) => `${card.querySelector(".minna-today-kind")?.textContent}|${card.className}`),
    );
    expect(new Set(looks).size, looks.join(" / ")).toBe(1);

    // 1人目：横に払うと消える
    const first = names[0]!;
    await expect(async () => {
      await swipe(page, modal.getByRole("article"), -240);
      await expect(modal.getByRole("article", { name: first, exact: true })).toHaveCount(0, { timeout: 1000 });
    }).toPass();
    await expect(count).toHaveAttribute("aria-label", "1 枚目（全 3 枚）");

    // 2人目：返事を送ると、それだけで消える
    const second = (await modal.getByRole("article").getAttribute("aria-label")) ?? "";
    await modal.getByRole("article").getByRole("button", { name: "返信", exact: true }).click();
    const sheet = screen.getByRole("dialog", { name: /さんへの返信$/ });
    await sheet.getByLabel("返信").fill(`今日の3人からの返事 ${size.width} ${test.info().testId}`);
    await sheet.getByRole("button", { name: "返信する" }).click();
    await expect(modal.getByRole("article", { name: second, exact: true })).toHaveCount(0);
    await expect(count).toHaveAttribute("aria-label", "1 枚目（全 2 枚）");

    // 3人目：払うと、おしまい。次のおすすめがあれば出す
    const third = (await modal.getByRole("article").getAttribute("aria-label")) ?? "";
    await expect(async () => {
      await swipe(page, modal.getByRole("article"), 240);
      await expect(modal.getByRole("article", { name: third, exact: true })).toHaveCount(0, { timeout: 1000 });
    }).toPass();
    await expect(modal.getByRole("heading", { name: "おしまい" })).toBeVisible();
    await expect(modal.getByText("今日の3人は、おしまいです。ありがとうございます")).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`today-done-${size.width}.png`) });
    const next = modal.getByRole("button", { name: /^次のおすすめを見る（\d+件）$/ });
    await expect(next).toBeVisible();
    await next.click();
    // 次の3人。前に出た人は出さない
    await expect(count).toHaveAttribute("aria-label", /^1 枚目/);
    const more = await cards.evaluateAll((list) => list.map((card) => card.getAttribute("aria-label")));
    expect(more.length).toBeGreaterThan(0);
    expect(more.length).toBeLessThanOrEqual(3);
    for (const name of more) expect(names).not.toContain(name);
    expect(new Set(more).size).toBe(more.length);
  });
}

test("/today でも、払うと消え、3人とも済むとおしまいと次のおすすめ", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await asTeacher(page);
  await page.goto("/today");
  const count = page.locator(".today-card .count").first();
  await expect(count).toContainText("1 枚目（全 3 枚）");
  // 黄色の別枠はない
  await expect(page.locator(".quiet-note")).toHaveCount(0);
  // 「しばらく出さない」のボタンは、払う操作に置き換えた
  await expect(page.getByRole("button", { name: "しばらく出さない" })).toHaveCount(0);
  const seen: string[] = [];
  for (const left of [2, 1, 0]) {
    const card = page.locator("section.today-card");
    const name = (await card.getAttribute("aria-label")) ?? "";
    seen.push(name);
    await expect(async () => {
      await swipe(page, card, -240);
      await expect(page.locator(`section.today-card[aria-label="${name}"]`)).toHaveCount(0, { timeout: 1000 });
    }).toPass();
    if (left > 0) await expect(count).toContainText(`1 枚目（全 ${left} 枚）`);
  }
  expect(new Set(seen).size).toBe(3);
  await expect(page.getByText("今日の3人は、おしまいです。ありがとうございます")).toBeVisible();
  await page.getByRole("button", { name: /^次のおすすめを見る（\d+件）$/ }).click();
  await expect(count).toContainText("1 枚目");
  expect(seen).not.toContain(await page.locator("section.today-card").getAttribute("aria-label"));
});
