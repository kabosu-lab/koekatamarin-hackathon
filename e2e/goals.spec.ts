import { expect, test } from "@playwright/test";
import { switchPerson } from "./helpers";

const AOKI = "青木 ひより（2年）";
const NODA = "野田 翔（情報・ものづくり部顧問）";

test("話の中で提案され、押すと残り、できたら投稿になり、今日の3人に出る", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  const goal = `資格の動画を見たい ${test.info().testId}`;
  await page.goto("/");
  await switchPerson(page, AOKI);

  await page.getByLabel("パートナーに書く").fill(goal);
  await page.getByRole("button", { name: "パートナーへ送る" }).click();
  const card = page.getByRole("region", { name: "頑張りたいことの提案" });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "しておく" }).click();
  await expect(page.locator(".notice")).toContainText("残しました");

  await page.goto("/me?open=goals");
  const panel = page.getByRole("region", { name: "頑張りたいこと" });
  const item = panel.getByRole("listitem").filter({ hasText: "資格の動画" }).first();
  await expect(item).toBeVisible();
  await panel.getByRole("button", { name: "耳が痛め" }).click();
  await expect(panel.getByRole("button", { name: "耳が痛め" })).toHaveAttribute("aria-pressed", "true");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);

  await item.getByRole("button", { name: "できた" }).click();
  await panel.getByRole("link", { name: "みんなに言っておく" }).click();

  await expect(page.locator(".sent")).toContainText("やったね");
  await page.getByRole("button", { name: "とどける" }).click();
  await page.getByRole("button", { name: "本人として送る" }).click();
  await expect(page.locator(".sent").first()).toBeVisible();
  await expect(page.getByText("に届きました")).toBeVisible();

  await switchPerson(page, NODA);
  await page.goto("/today");
  // 最初の3人はランダム。めくると、できた投稿がおすすめで出る
  const done = page.getByText("頑張ってきたことが、できた投稿");
  for (let i = 0; i < 6 && !(await done.isVisible()); i++) {
    const next = page.getByRole("button", { name: "次へ" });
    if ((await next.count()) === 0) await page.getByRole("button", { name: /もっと見る/ }).click();
    else await next.click();
  }
  await expect(done).toBeVisible();
  await expect(page.getByText(/資格の動画/).first()).toBeVisible();
  await page.context().close();
});

test("頑張りたいことは他の人に見えず、足す、直す、消すができる", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/");
  await switchPerson(page, NODA);
  await page.goto("/me?open=goals");
  const panel = page.getByRole("region", { name: "頑張りたいこと" });
  const secret = `内緒の頑張り ${test.info().testId}`.slice(0, 40);
  await panel.getByLabel("頑張りたいことを足す").fill(secret);
  await panel.getByRole("button", { name: "足す" }).click();
  const item = panel.getByRole("listitem").filter({ hasText: secret });
  await expect(item).toBeVisible();

  await item.getByRole("button", { name: "直す" }).click();
  await panel.getByLabel("頑張りたいことを直す").fill(`${secret}2`);
  await panel.locator(".goal-list form").getByRole("button", { name: "直す" }).click();
  const edited = panel.getByRole("listitem").filter({ hasText: `${secret}2` });
  await expect(edited).toBeVisible();

  await page.goto("/");
  await switchPerson(page, AOKI);
  await page.goto("/me");
  await expect(page.getByText(secret)).toHaveCount(0);

  await page.goto("/");
  await switchPerson(page, NODA);
  await page.goto("/me?open=goals");
  await panel.getByRole("listitem").filter({ hasText: `${secret}2` }).getByRole("button", { name: "消す" }).click();
  await expect(panel.getByText(secret)).toHaveCount(0);
  await page.context().close();
});

test("モダンでも使え、横にはみ出さない", async ({ browser }) => {
  const context = await browser.newContext();
  await context.addCookies([{ name: "koekata_theme", value: "modern", url: "http://127.0.0.1:3100" }]);
  const page = await context.newPage();
  await page.goto("/me?open=goals");
  await expect(page.getByRole("region", { name: "頑張りたいこと" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
  await context.close();
});
