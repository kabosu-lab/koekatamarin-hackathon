import { expect, type Locator, type Page, test } from "@playwright/test";
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
    if ((await next.count()) === 0) await page.getByRole("button", { name: /次のおすすめを見る/ }).click();
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
  await context.addCookies([{ name: "koekata_theme", value: "modern", url: `http://127.0.0.1:${process.env.KOEKATA_E2E_PORT ?? 3100}` }]);
  const page = await context.newPage();
  await page.goto("/me?open=goals");
  await expect(page.getByRole("region", { name: "頑張りたいこと" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
  await context.close();
});

/** 促し方の2つのボタンを替えて、印・塗り・知らせ・開き直しを確かめる（どちらが選ばれていても始められる） */
async function checkNudgeToggle(page: Page) {
  const panel = page.getByRole("region", { name: "頑張りたいこと" });
  const group = panel.getByRole("group", { name: "パートナーの促し方" });
  await expect(panel.getByText("近い話が出たとき、パートナーがこの言い方で背中を押します")).toBeVisible();
  const gentle = group.getByRole("button", { name: "そっと" });
  const blunt = group.getByRole("button", { name: "耳が痛め" });
  const background = (button: Locator) => button.evaluate((element) => getComputedStyle(element).backgroundColor);

  for (const [chosen, other, label] of [
    [blunt, gentle, "耳が痛め"],
    [gentle, blunt, "そっと"],
  ] as const) {
    await chosen.click();
    await expect(chosen).toHaveAttribute("aria-pressed", "true");
    await expect(other).toHaveAttribute("aria-pressed", "false");
    await expect(panel.getByRole("status").filter({ hasText: `「${label}」にしました` })).toBeVisible();
    // 選んだほうが塗られて、もう一方と見た目が違う
    await expect.poll(async () => (await background(chosen)) !== (await background(other))).toBe(true);
  }

  // 開き直しても覚えている
  await blunt.click();
  await expect(blunt).toHaveAttribute("aria-pressed", "true");
  await expect(panel.getByRole("status").filter({ hasText: "「耳が痛め」にしました" })).toBeVisible();
  await page.reload();
  await expect(group.getByRole("button", { name: "耳が痛め" })).toHaveAttribute("aria-pressed", "true");
  await expect(group.getByRole("button", { name: "そっと" })).toHaveAttribute("aria-pressed", "false");
}

test("促し方は2つで1組の切り替えで、選んだほうが塗られ、「〇〇にしました」と出て、開き直しても覚えている", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/");
  await switchPerson(page, NODA);
  await page.goto("/me?open=goals");
  await checkNudgeToggle(page);
  await context.close();
});

test.describe("試用版", () => {
  // このファイルは「スマホ」の project で動くので、試用のサーバー（次の番号）へは住所を替えて向ける
  test.use({ baseURL: `http://127.0.0.1:${Number(process.env.KOEKATA_E2E_PORT ?? 3100) + 1}` });

  test("試用版でも促し方を替えられ、関所で落ちない", async ({ page }) => {
    await page.goto("/access");
    await page.getByLabel("合言葉").fill("test-code");
    await page.getByRole("button", { name: "入る" }).click();
    await expect(page.locator(".talk")).toBeVisible();
    await page.getByRole("dialog", { name: "試用版について" }).getByRole("button", { name: "わかった" }).click();
    await page.goto("/me?open=goals");
    const response = page.waitForResponse((r) => r.url().endsWith("/api/goals") && r.request().method() === "POST");
    await page.getByRole("group", { name: "パートナーの促し方" }).getByRole("button", { name: "耳が痛め" }).click();
    expect((await response).status()).toBe(200);
    await checkNudgeToggle(page);
  });
});
