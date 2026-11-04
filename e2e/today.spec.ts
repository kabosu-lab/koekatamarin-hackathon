import { expect, test } from "@playwright/test";
import { switchPerson } from "./helpers";

test("カードは1枚ずつで、押さないと次が出ず、3枚で止まる", async ({ page }) => {
  await page.goto("/today");

  const count = page.locator(".today-card .count").first();
  await expect(count).toContainText("1 枚目");
  // 自動で流れない
  await page.waitForTimeout(500);
  await expect(count).toContainText("1 枚目");
  await expect(page.locator(".today-card")).toHaveCount(1);

  await page.getByRole("button", { name: "次へ" }).click();
  await expect(count).toContainText("2 枚目");
  await page.getByRole("button", { name: "次へ" }).click();
  await expect(count).toContainText("3 枚目");
  await page.getByRole("button", { name: "次へ" }).click();

  await expect(page.getByText("今日はここまで")).toBeVisible();
  await page.getByRole("button", { name: "もっと見る" }).click();
  await expect(count).toContainText("4 枚目");
});

test("応援のきっかけが添えられ、押すと応援になる", async ({ page }) => {
  await page.goto("/today?view=popular");
  await expect(page.locator(".hint-line")).toBeVisible();

  const button = page.getByRole("button", { name: /^応援/ });
  if ((await button.innerText()) === "応援する") await button.click();
  await expect(page.getByRole("button", { name: "応援しました" })).toBeDisabled();
});

test("カードで見ると、投稿した本人に誰が見たか伝わり、他の人には見えない", async ({ page }) => {
  const words = `見てもらう投稿 ${test.info().testId}`;
  await page.goto("/");
  await switchPerson(page, "中村 結衣（1年・吹奏楽部）");
  const response = await page.request.post("/api/publish", { data: { text: words, channelId: "clubs" } });
  const { postId } = (await response.json()) as { postId: string };

  await page.goto("/");
  await switchPerson(page, "川村 陽菜（理科・1年副担任）");
  expect((await page.request.post("/api/today/seen", { data: { postId } })).ok()).toBe(true);

  await page.goto("/");
  await switchPerson(page, "中村 結衣（1年・吹奏楽部）");
  await page.goto("/today");
  await expect(page.locator(".seen-note").filter({ hasText: words })).toContainText("川村 陽菜さん");

  await page.goto("/");
  await switchPerson(page, "木下 蓮（3年・ものづくり部）");
  await page.goto("/today");
  await expect(page.locator(".seen-note").filter({ hasText: words })).toHaveCount(0);
});

test("スマホ幅で横にはみ出さない", async ({ page }) => {
  await page.goto("/today");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});

async function fakeSpeech(page: import("@playwright/test").Page, spoken: string) {
  await page.addInitScript((text) => {
    class FakeRecognition {
      onresult: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      start() {}
      stop() {
        this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal: true })] });
        this.onend?.();
      }
    }
    Object.assign(window, { webkitSpeechRecognition: FakeRecognition, SpeechRecognition: FakeRecognition });
  }, spoken);
}

for (const theme of ["pop", "modern"] as const) {
  test(`${theme}：カードから声で話すと返信の下書きができ、本人が確かめて送れる`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 412, height: 860 } });
    await context.addCookies([{ name: "koekata_theme", value: theme, url: "http://127.0.0.1:3100" }]);
    const page = await context.newPage();
    const words = `声のカード返信 ${theme} ${test.info().testId}`;
    await fakeSpeech(page, words);
    await page.goto("/today");
    await page.getByRole("button", { name: "話して返信する" }).click();
    await page.getByRole("button", { name: "声で話す" }).click();
    await page.getByRole("button", { name: "話し終わった" }).click();
    await expect(page.getByLabel("話したこと")).toHaveValue(words);
    await page.getByRole("button", { name: "返信の言葉にする" }).click();
    await expect(page.getByLabel("返信の文章")).toHaveValue(words);
    await page.getByRole("button", { name: "本人として返信する" }).click();
    await expect(page.getByText("返信を届けました。")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBe(0);
    await page.goto("/teams");
    await context.close();
  });
}

test("文字で書いても返信でき、中身がなければ聞き返す", async ({ page }) => {
  await page.goto("/today");
  await page.getByRole("button", { name: "話して返信する" }).click();
  await page.getByLabel("話したこと").fill("わからん");
  await page.getByRole("button", { name: "返信の言葉にする" }).click();
  await expect(page.getByRole("status").filter({ hasText: "あなたのときはどうでしたか" })).toBeVisible();
  await expect(page.getByLabel("返信の文章")).toHaveCount(0);
});
