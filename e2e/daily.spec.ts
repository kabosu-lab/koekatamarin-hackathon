import { expect, type Page, test } from "@playwright/test";
import { switchPerson } from "./helpers";

async function say(page: Page, text: string) {
  await page.getByLabel("パートナーに書く").fill(text);
  await page.getByRole("button", { name: "パートナーへ送る" }).click();
  await expect(page.getByRole("log").locator(".bubble.assistant").last()).toBeVisible();
}

test("話したことが日報の項目になり、チェックした項目だけが管理職に届き、一言が返る", async ({ page }) => {
  const shared = `作文を褒めた ${test.info().testId}`;
  await page.goto("/");
  await switchPerson(page, "川村 陽菜（理科・1年副担任）");
  await say(page, shared);

  await page.getByRole("link", { name: "履歴と設定" }).click();
  await page.getByRole("link", { name: "今日の日報" }).click();
  await page.getByRole("button", { name: "今日の日報を作る" }).click();

  const item = page.getByRole("checkbox", { name: shared });
  await expect(item).not.toBeChecked();

  await page.goto("/");
  await switchPerson(page, "藤本 恵（教頭）");
  await page.goto("/daily/received");
  await expect(page.getByText(shared)).toHaveCount(0);

  await page.goto("/");
  await switchPerson(page, "川村 陽菜（理科・1年副担任）");
  await page.goto("/daily");
  await page.getByRole("checkbox", { name: shared }).click();
  await expect(page.getByRole("checkbox", { name: shared })).toBeChecked();

  await page.goto("/");
  await switchPerson(page, "藤本 恵（教頭）");
  await page.goto("/daily/received");
  const report = page.getByRole("article", { name: "川村 陽菜さんから" });
  await expect(report).toContainText(shared);
  await report.getByLabel("一言かえす").fill("よく見ていますね");
  await report.getByRole("button", { name: "一言を送る" }).click();
  await expect(report.locator(".response-card")).toContainText("よく見ていますね");

  await page.goto("/");
  await switchPerson(page, "川村 陽菜（理科・1年副担任）");
  await page.goto("/daily");
  await expect(page.getByRole("region", { name: "届いた一言" })).toContainText("藤本 恵先生");
});

test("生徒の日記は担任にだけ届く", async ({ page }) => {
  const words = `朝練を頑張った ${test.info().testId}`;
  await page.goto("/");
  await switchPerson(page, "中村 結衣（1年・吹奏楽部）");
  await say(page, words);
  await page.goto("/daily");
  await expect(page.getByRole("heading", { name: "今日の日記" })).toBeVisible();
  await page.getByRole("button", { name: "今日の日記を作る" }).click();
  await page.getByRole("checkbox", { name: words }).click();
  await expect(page.getByRole("checkbox", { name: words })).toBeChecked();

  await page.goto("/");
  await switchPerson(page, "藤本 恵（教頭）");
  await page.goto("/daily/received");
  await expect(page.getByText(words)).toHaveCount(0);

  await page.goto("/");
  await switchPerson(page, "川村 陽菜（理科・1年副担任）");
  await page.goto("/daily/received");
  await expect(page.getByRole("article", { name: "中村 結衣さんから" })).toContainText(words);
});

test("画面を行き来してもパートナーとの話は消えない", async ({ page }) => {
  const words = `続きの話 ${test.info().testId}`;
  await page.goto("/");
  await say(page, words);
  const nav = page.getByRole("navigation", { name: "画面の切り替え" });
  await nav.getByRole("link", { name: "みんな" }).click();
  await expect(page.getByRole("heading", { name: "みんな" })).toBeVisible();
  await nav.getByRole("link", { name: "話す" }).click();
  await expect(page.getByRole("log").locator(".bubble.user")).toContainText(words);
});

test("材料がないときは作らず、そのことを伝える", async ({ page }) => {
  await page.goto("/");
  await switchPerson(page, "白石 文（養護・相談室）");
  await page.goto("/daily");
  await page.getByRole("button", { name: "今日の日報を作る" }).click();
  await expect(page.locator(".notice")).toContainText("やり取りがまだない");
});

test("チェックは1つずつ確定し、処理中は押せない。失敗したら元のまま伝える", async ({ page }) => {
  const words = `チェックの確認 ${test.info().testId}`;
  await page.goto("/");
  await switchPerson(page, "野田 翔（情報・ものづくり部顧問）");
  await say(page, words);
  await page.goto("/daily");
  await page.getByRole("button", { name: "今日の日報を作る" }).click();
  const box = page.getByRole("checkbox", { name: words });
  await expect(box).not.toBeChecked();

  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/daily", async (route) => {
    await held;
    await route.fulfill({ status: 503, json: { error: "x" } });
  });
  await box.click();
  await expect(box).toBeDisabled();
  release();

  await expect(page.locator(".notice")).toContainText("変えられませんでした");
  await expect(box).toBeEnabled();
  await expect(box).not.toBeChecked();
});

test("チェックと文章は同じ行に並ぶ", async ({ page }) => {
  await page.goto("/");
  await switchPerson(page, "大河原 誠（英語・学年主任）");
  await say(page, `並びの確認 ${test.info().testId}`);
  await page.goto("/daily");
  await page.getByRole("button", { name: "今日の日報を作る" }).click();
  const label = page.locator("label.daily-item").first();
  const box = await label.locator("input").boundingBox();
  const text = await label.locator("span").boundingBox();
  expect(box && text && box.x + box.width <= text.x).toBe(true);
  expect(box && text && box.y < text.y + text.height).toBe(true);
});

test("夕方のまとめを係に頼むと、どう作ったかが分かり、チェックは付いていない", async ({ page }) => {
  const words = `朝練の話 ${test.info().testId}`;
  await page.goto("/");
  await switchPerson(page, "木下 蓮（3年・ものづくり部）");
  await say(page, words);
  await page.getByRole("button", { name: "とどける" }).click();
  await page.getByRole("button", { name: "本人として送る" }).click();
  await expect(page.locator(".sent")).toBeVisible();

  await page.goto("/daily");
  await page.getByRole("button", { name: "夕方のまとめを係に頼む" }).click();
  await expect(page.getByText("クラウドの係は使っていません")).toBeVisible();
  const boxes = page.getByRole("checkbox");
  await expect(boxes.first()).toBeVisible();
  await expect(page.getByRole("checkbox", { checked: true })).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
});
