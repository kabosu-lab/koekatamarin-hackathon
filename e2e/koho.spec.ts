import { expect, type Browser, test } from "@playwright/test";
import { PROMISE_SEEN } from "./promise-seen";

test.use({ storageState: { cookies: PROMISE_SEEN, origins: [] } });

async function open(browser: Browser, personId: string) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies([
    { name: "koekata_person", value: personId, domain: "127.0.0.1", path: "/" },
    { name: "koekata_avatar", value: "hide", domain: "127.0.0.1", path: "/" },
  ]);
  return context.newPage();
}

test("広報の担当が候補から本人に確認し、本人が同意したものだけ進む", async ({ browser }) => {
  const words = `外へ紹介したい工夫 ${test.info().testId}`;
  const author = await open(browser, "nakamura");
  await author.goto("/");
  expect((await author.request.post("/api/publish", { data: { text: words, channelId: "study" } })).ok()).toBe(true);

  const officer = await open(browser, "fujimoto");
  await officer.goto("/minna");
  await officer.getByRole("link", { name: "広報の候補" }).click();
  const candidate = officer.getByRole("region", { name: "候補" }).getByRole("article").filter({ hasText: words });
  await candidate.getByRole("button", { name: "本人に確認する" }).click();
  await expect(officer.getByRole("region", { name: "本人に確認したもの" })).toContainText("進んでいません");

  await author.goto("/inbox");
  const request = author.getByRole("region", { name: "広報への紹介の確認" }).filter({ hasText: words });
  await expect(request).toContainText("断っても、誰にも伝わりません");
  await expect(request.getByRole("button", { name: "紹介してよい" })).toBeVisible();
  // 生徒は保護者の同意がないと進まない
  await request.getByRole("button", { name: "紹介してよい" }).click();
  await expect(request).toBeVisible();
  await request.getByLabel("保護者の同意があります").check();
  await request.getByRole("button", { name: "紹介してよい" }).click();
  await expect(author.getByText(words)).toHaveCount(0);

  await officer.reload();
  await expect(officer.getByRole("region", { name: "本人に確認したもの" }).filter({ hasText: words })).toContainText("本人が同意しました");
});

test("担当でない人には入口がなく、開いても候補が見えない", async ({ browser }) => {
  const page = await open(browser, "noda");
  await page.goto("/minna");
  await expect(page.getByRole("link", { name: "広報の候補" })).toHaveCount(0);
  await page.goto("/koho");
  await expect(page.getByText("広報の担当の先生のものです")).toBeVisible();
  await expect(page.getByRole("button", { name: "本人に確認する" })).toHaveCount(0);
});
