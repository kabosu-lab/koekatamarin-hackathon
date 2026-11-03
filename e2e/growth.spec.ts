import { expect, test } from "@playwright/test";
import { switchPerson } from "./helpers";

test("画面は「話す」「みんな」「じぶん」の3つで、行き来できる", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "画面の切り替え" });
  await expect(nav.getByRole("link")).toHaveText(["話す", "みんな", "じぶん"]);

  await nav.getByRole("link", { name: "みんな" }).click();
  await expect(page.getByRole("heading", { name: "みんな" })).toBeVisible();
  await nav.getByRole("link", { name: "じぶん" }).click();
  await expect(page.getByRole("heading", { name: "じぶん" })).toBeVisible();
});

test("下の階層の画面でも、今どこにいるかが分かる", async ({ page }) => {
  const current = page.getByRole("navigation", { name: "画面の切り替え" }).locator('[aria-current="page"]');
  await page.goto("/today");
  await expect(current).toHaveText("みんな");
  await page.goto("/daily");
  await expect(current).toHaveText("じぶん");
  await page.goto("/inbox");
  await expect(current).toHaveText("話す");
});

test("最初の問いかけに答えると卵の系統が決まり、絵が読み込まれる", async ({ browser }) => {
  // 他のテストと混ざらないよう、まだ分身のない佐伯先生の新しい文脈で進める
  const page = await (await browser.newContext()).newPage();
  await page.goto("/me");
  const quiz = page.getByRole("region", { name: "最初の問いかけ" });
  if (await quiz.isVisible()) {
    await quiz.getByRole("button", { name: "人物" }).click();
    await quiz.getByRole("button", { name: "じっくり話を聞く" }).click();
    await expect(quiz).toHaveCount(0);
  }
  const image = page.getByRole("region", { name: "相棒" }).locator("img");
  await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  await page.context().close();
});

test("サンクスカードが相手に届き、他の人には見えない", async ({ page }) => {
  const words = `助かりました ${test.info().testId}`;
  await page.goto("/");
  await switchPerson(page, "青木 ひより（2年）");
  await page.goto("/me");
  const form = page.getByRole("region", { name: "サンクスカードを送る" });
  await form.getByLabel("送る相手").selectOption({ label: "野田 翔（情報・ものづくり部顧問）" });
  await form.getByLabel("ありがとうの言葉").fill(words);
  await form.getByRole("button", { name: "サンクスカードを送る" }).click();
  await expect(form).toContainText("ありがとうが届きました");

  await page.goto("/");
  await switchPerson(page, "野田 翔（情報・ものづくり部顧問）");
  await page.goto("/me");
  await expect(page.getByRole("region", { name: "もらったありがとう" })).toContainText(words);

  await page.goto("/");
  await switchPerson(page, "木下 蓮（3年・ものづくり部）");
  await page.goto("/me");
  await expect(page.getByText(words)).toHaveCount(0);
});

test("プロフィールの下書きを確かめ、1回だけ直して載せ、いつでも消せる", async ({ page }) => {
  await page.goto("/");
  await switchPerson(page, "藤本 恵（教頭）");
  await page.goto("/me");

  await page.getByRole("button", { name: "プロフィールを更新する" }).click();
  const draft = page.getByRole("group", { name: "プロフィールの下書き" });
  await expect(draft).toContainText("こう載せていい？");

  await draft.getByLabel("ここをこう変えて").fill("短くして");
  await draft.getByRole("button", { name: "この頼みで直す" }).click();
  await expect(draft).toContainText("更新ごとに1回です");
  await expect(draft.getByRole("button", { name: "この頼みで直す" })).toHaveCount(0);
  const text = await draft.locator(".draft-text").innerText();

  await draft.getByRole("button", { name: "これで載せる" }).click();
  await expect(page.getByTestId("profile-text")).toHaveText(text);

  await page.getByRole("button", { name: "プロフィールを消す" }).click();
  await expect(page.getByTestId("profile-text")).toHaveText("まだ載せていません。");
});

test("校内の桜と、周りの相棒が見える。季節を変えて見られる", async ({ page }) => {
  await page.goto("/minna");
  await expect(page.getByRole("region", { name: "校内の桜" })).toContainText("今年の葉");
  await expect(page.getByRole("region", { name: "桜のまわりの相棒たち" }).getByRole("link")).toHaveCount(9);

  await page.getByRole("link", { name: "春を見る" }).click();
  await expect(page.getByRole("region", { name: "校内の桜" })).toContainText("今年の桜が");
  await expect(page.locator(".petal").first()).toBeAttached();

  await page.getByRole("region", { name: "桜のまわりの相棒たち" }).getByRole("link", { name: /野田 翔/ }).click();
  await expect(page.getByRole("heading", { name: "野田 翔" })).toBeVisible();
  await expect(page.getByRole("region", { name: "応援とコメント" })).toContainText("応援");
});

test("決まった名前以外の絵は読めない", async ({ request }) => {
  expect((await request.get("/api/art/egg.png")).ok()).toBe(true);
  expect((await request.get("/api/art/characters-sheet.png")).status()).toBe(404);
  expect((await request.get("/api/art/..%2F..%2F.env")).status()).toBe(404);
});

test("スマホ幅で横にはみ出さない", async ({ page }) => {
  for (const path of ["/me", "/minna", "/people/noda"]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  }
});
