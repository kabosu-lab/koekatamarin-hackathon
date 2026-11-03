import { expect, type Page, test } from "@playwright/test";
import { switchPerson } from "./helpers";

async function composeFromTalk(page: Page, words: string) {
  await page.getByRole("button", { name: "文字で書く" }).click();
  await page.getByLabel("相棒に書く").fill(words);
  await page.getByRole("button", { name: "相棒に送る" }).click();
  await expect(page.getByRole("button", { name: "言葉にして送る" })).toBeEnabled();
  await page.getByRole("button", { name: "言葉にして送る" }).click();
  await expect(page.getByRole("region", { name: "言葉にして送る" })).toBeVisible();
}

test("みんなの画面から入り、押したときだけ候補と理由が出る", async ({ page }) => {
  let calls = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/nakama")) calls += 1;
  });
  await page.goto("/");
  await switchPerson(page, "青木 ひより（2年）");
  await page.goto("/minna");
  await page.getByRole("link", { name: "仲間を探す" }).click();
  await expect(page).toHaveURL(/\/nakama/);
  expect(calls).toBe(0);

  await page.getByRole("button", { name: "仲間を探す" }).click();
  await expect(page.locator(".nakama li").first()).toContainText("公開の投稿に");
  expect(calls).toBe(1);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
});

test("投稿の数に関係なく、公開で送った人には同じ入口が出る", async ({ page }) => {
  for (const name of ["中村 結衣（1年・吹奏楽部）", "佐伯 みどり"]) {
    await page.goto("/");
    const option = page.getByLabel("使う人").locator("option", { hasText: name.split("（")[0] });
    await switchPerson(page, (await option.textContent()) ?? name);
    await composeFromTalk(page, `今日は過去問を解いた ${test.info().testId}`);
    await page.getByRole("region", { name: "言葉にして送る" }).getByRole("button", { name: "本人として送る" }).click();
    const sent = page.locator(".sent");
    await expect(sent.getByRole("link", { name: "同じことに取り組んでいる人を探してみる？" })).toBeVisible();
    await sent.getByRole("button", { name: "送ったものを取り消す" }).click();
    await expect(sent).toHaveCount(0);
  }
});

test("自分だけの投稿のあとには、入口を出さない", async ({ page }) => {
  await page.goto("/");
  await composeFromTalk(page, `自分だけの話 ${test.info().testId}`);
  await page.getByLabel("見える範囲").selectOption({ label: "自分だけ" });
  await page.getByRole("button", { name: "本人として送る" }).click();
  await expect(page.locator(".sent")).toBeVisible();
  await expect(page.getByRole("link", { name: "同じことに取り組んでいる人を探してみる？" })).toHaveCount(0);
});

test("しばらく出さないは本人にだけ効き、相手には何も見えず、本人が戻せる", async ({ page }) => {
  await page.goto("/");
  await switchPerson(page, "大河原 誠（英語・学年主任）");
  await page.goto("/today?view=popular");

  const name = (await page.locator(".today-card .who strong").textContent()) ?? "";
  await page.getByRole("button", { name: "しばらく出さない" }).click();
  await expect(page.getByRole("status")).toContainText("相手には伝わりません");
  await expect(page.locator(".today-card .who strong").filter({ hasText: name })).toHaveCount(0);

  await page.reload();
  await expect(page.locator(".today-card .who strong").filter({ hasText: name })).toHaveCount(0);

  await page.goto("/nakama");
  const list = page.getByRole("region", { name: "しばらく出していない人" });
  await expect(list).toContainText(name);

  // 相手の画面には、誰かに隠されたことが出ない
  await page.goto("/");
  const option = page.getByLabel("使う人").locator("option", { hasText: name });
  await switchPerson(page, (await option.textContent()) ?? "");
  for (const path of ["/nakama", "/me", "/today"]) {
    await page.goto(path);
    await expect(page.getByText("大河原 誠").filter({ hasText: "しばらく" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "しばらく出していない人" })).toHaveCount(0);
  }

  await page.goto("/");
  await switchPerson(page, "大河原 誠（英語・学年主任）");
  await page.goto("/nakama");
  await page.getByRole("region", { name: "しばらく出していない人" }).getByRole("button", { name: "また出す" }).click();
  await expect(page.getByRole("region", { name: "しばらく出していない人" })).toHaveCount(0);
});
