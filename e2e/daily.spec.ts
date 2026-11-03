import { expect, type Page, test } from "@playwright/test";
import { switchPerson } from "./helpers";

async function say(page: Page, text: string) {
  await page.getByRole("button", { name: "文字で書く" }).click();
  await page.getByLabel("相棒に書く").fill(text);
  await page.getByRole("button", { name: "相棒に送る" }).click();
  await expect(page.getByRole("log").locator(".bubble.assistant").last()).toBeVisible();
}

test("話したことが日報の項目になり、チェックした項目だけが管理職に届き、一言が返る", async ({ page }) => {
  const shared = `作文を褒めた ${test.info().testId}`;
  await page.goto("/");
  await switchPerson(page, "川村 陽菜（理科・1年副担任）");
  await say(page, shared);

  await page.getByRole("navigation", { name: "画面の切り替え" }).getByRole("link", { name: "じぶん" }).click();
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
  await page.getByRole("checkbox", { name: shared }).check();
  await page.waitForLoadState("networkidle");

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
  await page.getByRole("checkbox", { name: words }).check();
  await page.waitForLoadState("networkidle");

  await page.goto("/");
  await switchPerson(page, "藤本 恵（教頭）");
  await page.goto("/daily/received");
  await expect(page.getByText(words)).toHaveCount(0);

  await page.goto("/");
  await switchPerson(page, "川村 陽菜（理科・1年副担任）");
  await page.goto("/daily/received");
  await expect(page.getByRole("article", { name: "中村 結衣さんから" })).toContainText(words);
});

test("画面を行き来しても相棒との話は消えない", async ({ page }) => {
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
