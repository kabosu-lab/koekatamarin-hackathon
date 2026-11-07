import { expect, type Page, test } from "@playwright/test";

// 0-3b：投稿の件名。シートの Teams の見え方の一番上に太字で出し、札は押すと回り、言葉は押すと直せる

async function say(page: Page, text: string) {
  await page.getByLabel("パートナーに書く").fill(text);
  await page.getByRole("button", { name: "パートナーへ送る" }).click();
  await expect(page.getByRole("log").locator(".bubble.assistant").last()).toBeVisible();
  await expect(page.getByRole("button", { name: "とどける" })).toBeEnabled();
}

test("下書きに件名が付き、札を回して言葉を直すと、その件名で送られ、みんなのカードに出る", async ({ page, context }) => {
  await context.addCookies([{ name: "koekata_today_seen", value: "1", domain: "127.0.0.1", path: "/" }]);
  const words = `声を小さくしたら、教室が静かになった ${test.info().testId}`;
  await page.goto("/");
  await say(page, words);
  await page.getByRole("button", { name: "とどける" }).click();

  const subject = page.locator(".preview .preview-subject");
  // 件名は Teams の見え方の一番上（名前より上）
  const tag = subject.getByRole("button", { name: "種類を替える" });
  await expect(tag).toHaveText("【うまくいった】");
  await expect(subject.locator("strong")).toHaveText(/^声を小さくしたら、教室が静かになった/);
  const subjectBox = await subject.boundingBox();
  const authorBox = await page.locator(".preview .preview-author").boundingBox();
  expect(subjectBox!.y).toBeLessThan(authorBox!.y);

  // 札は押すと次の種類に回る（選ぶ欄は増やさない）
  await tag.click();
  await expect(tag).toHaveText("【困りごと】");
  await expect(page.locator(".preview select")).toHaveCount(0);

  // 言葉は押すと入力に替わり、直せる
  await subject.getByRole("button", { name: "件名を直す" }).click();
  await page.getByLabel("件名", { exact: true }).fill(`席替えのコツ ${test.info().testId.slice(0, 6)}`);
  await page.getByLabel("件名", { exact: true }).press("Enter");
  const title = `【困りごと】席替えのコツ ${test.info().testId.slice(0, 6)}`;
  await expect(subject).toContainText(title);

  await expect(page.locator(".perception")).toContainText("大丈夫そう");
  const published = page.waitForRequest((request) => request.url().endsWith("/api/publish"));
  await page.getByRole("button", { name: "本人として送る" }).click();
  const body = (await published).postDataJSON() as { subject?: string; kind?: string; text?: string };
  expect(body).toMatchObject({ subject: title, kind: "trouble", text: words });

  // みんなのカードの本文の上に、件名が太字で1行
  await expect(async () => {
    await page.goto("/minna");
    const card = page.getByRole("article").filter({ hasText: words });
    await expect(card.locator(".post-subject strong")).toHaveText(title, { timeout: 2000 });
  }).toPass();
  const card = page.getByRole("article").filter({ hasText: words });
  const subjectY = (await card.locator(".post-subject").boundingBox())!.y;
  const bodyY = (await card.locator(".minna-post-body").first().boundingBox())!.y;
  expect(subjectY).toBeLessThan(bodyY);
});

test("件名のない古い投稿のカードには、件名の行を出さない", async ({ page, context }) => {
  await context.addCookies([{ name: "koekata_today_seen", value: "1", domain: "127.0.0.1", path: "/" }]);
  await page.goto("/minna");
  const scroller = page.getByRole("region", { name: "みんな" });
  await expect(scroller.getByRole("article").first()).toBeVisible();
  const empty = await page.locator(".post-subject").evaluateAll((rows) => rows.filter((row) => row.textContent?.trim() === "").length);
  expect(empty).toBe(0);
});
