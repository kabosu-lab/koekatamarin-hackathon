import { expect, test } from "@playwright/test";
import { switchPerson } from "./helpers";

// 0-2j：サンクスカードの送り先は、一覧（ドロップダウン）から選ばせない

test("ありがとうのタイルに選ぶ箱がなく、名前の一部や部活で絞り込んで送れる", async ({ page }) => {
  const words = `資料、助かりました ${test.info().testId}`;
  await page.goto("/");
  await switchPerson(page, "青木 ひより（2年）");
  await page.goto("/me?open=thanks");
  const form = page.getByRole("region", { name: "サンクスカードを送る" });
  await expect(form.getByRole("heading", { name: "ことばを届けたい人は？" })).toBeVisible();
  await expect(form.getByRole("combobox")).toHaveCount(0);
  await expect(form.locator("select")).toHaveCount(0);

  // 何も打たないうちは、全員の一覧を出さない
  await expect(form.getByRole("list", { name: "見つかった人" })).toHaveCount(0);
  await form.getByLabel("名前で探す").fill("ものづくり");
  const found = form.getByRole("list", { name: "見つかった人" });
  await expect(found.getByRole("button", { name: /野田 翔さん/ })).toBeVisible();
  await expect(found.getByRole("button", { name: /木下 蓮さん/ })).toBeVisible();
  await form.getByLabel("名前で探す").fill("木下");
  await expect(found.getByRole("button", { name: /野田 翔さん/ })).toHaveCount(0);
  await found.getByRole("button", { name: /木下 蓮さん/ }).click();

  await expect(form).toContainText("木下 蓮さんへ");
  await form.getByLabel("届けることば").fill(words);
  await expect(form.locator(".thanks-kind-line")).toContainText("ありがとう");
  await form.getByRole("button", { name: "サンクスカードを送る" }).click();
  await expect(form).toContainText("木下 蓮さんに、ありがとうが届きました");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
});

test("最近やりとりした人がチップで出て、押すとその人宛てになる。頑張ってたねも同じカードで送れる", async ({ page }) => {
  await page.goto("/");
  await switchPerson(page, "中村 結衣（1年・吹奏楽部）");
  const sent = await page.evaluate(async () => {
    const response = await fetch("/api/thanks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toPersonId: "kawamura", message: "実験の準備、助かりました" }),
    });
    return response.ok;
  });
  expect(sent).toBe(true);

  await page.goto("/me?open=thanks");
  const form = page.getByRole("region", { name: "サンクスカードを送る" });
  const chips = form.getByRole("group", { name: "最近やりとりした人" });
  await expect(chips.getByRole("button")).not.toHaveCount(0);
  expect(await chips.getByRole("button").count()).toBeLessThanOrEqual(5);
  await chips.getByRole("button", { name: "川村 陽菜さん" }).click();

  await form.getByLabel("届けることば").fill(`発表、頑張ってたね ${test.info().testId}`);
  await expect(form.locator(".thanks-kind-line")).toContainText("がんばったね");
  await form.getByRole("button", { name: "サンクスカードを送る" }).click();
  await expect(form).toContainText("川村 陽菜さんに、「がんばったね」が届きました");
});

test("受信箱の届いた返事の「ありがとう」から、その人宛てのカードが下から開いて送れる", async ({ page }) => {
  const words = `勉強のこつ、ありがとうございました ${test.info().testId}`;
  await page.goto("/");
  await switchPerson(page, "青木 ひより（2年）");
  await page.goto("/inbox");
  const replies = page.getByRole("region", { name: "届いた返事" });
  const entry = replies.getByRole("button", { name: "野田 翔さんにありがとうを送る" }).first();
  await entry.click();

  const sheet = page.getByRole("dialog", { name: "野田 翔さんへのサンクスカード" });
  await expect(sheet).toBeVisible();
  // 相手を探す欄はない（もう入っている）
  await expect(sheet.getByLabel("名前で探す")).toHaveCount(0);
  await expect(sheet.locator("select")).toHaveCount(0);
  await sheet.getByLabel("届けることば").fill(words);
  await sheet.getByRole("button", { name: "サンクスカードを送る" }).click();
  await expect(entry).toContainText("届きました");
  await expect(sheet).toBeHidden();

  await page.goto("/");
  await switchPerson(page, "野田 翔（情報・ものづくり部顧問）");
  await page.goto("/me?open=thanks");
  await expect(page.getByRole("region", { name: "もらったありがとう" })).toContainText(words);
});

test("みんなの頑張りの投稿には「おめでとう」があり、届いたカードはおめでとうの絵柄になる", async ({ page, context }) => {
  const words = `コンクール、おめでとう ${test.info().testId}`;
  await page.goto("/");
  await switchPerson(page, "木下 蓮（3年・ものづくり部）");
  // 今日の3人は自動で開かないようにしておく
  await context.addCookies([{ name: "koekata_today_seen", value: "1", domain: "127.0.0.1", path: "/" }]);
  await page.goto("/minna");
  // ほかのテストが投稿を足すと種の投稿が上の20件から外れるので、いま並んでいる頑張りの投稿を使う
  const entry = page.getByRole("button", { name: /さんにおめでとうを送る$/ }).first();
  const to = ((await entry.getAttribute("aria-label")) ?? (await entry.innerText())).replace(/さんにおめでとうを送る$/, "").trim();
  expect(to).not.toBe("");
  await entry.click();
  const sheet = page.getByRole("dialog", { name: `${to}さんへのサンクスカード` });
  await expect(sheet).toBeVisible();
  await sheet.getByLabel("届けることば").fill(words);
  await expect(sheet.locator(".thanks-kind-line")).toContainText("おめでとう");
  await sheet.getByRole("button", { name: "サンクスカードを送る" }).click();
  await expect(entry).toContainText("届きました");

  await page.goto("/me?open=settings");
  const option = await page.getByLabel("試す人を切り替える").locator("option", { hasText: `${to}（` }).first().innerText();
  await switchPerson(page, option.trim());
  await page.goto("/me?open=thanks");
  const card = page.getByRole("region", { name: "もらったありがとう" }).locator(".thanks-card").filter({ hasText: words });
  await expect(card).toHaveAttribute("data-kind", "congrats");
});

test("今日の3人のカードの「ありがとう」からも、画面の中にシートが開く", async ({ page }) => {
  await page.goto("/minna");
  const modal = page.getByRole("dialog", { name: "今日の3人" });
  // その日に一度出したあとは、下の帯から開く
  if (!(await modal.isVisible())) await page.getByRole("navigation", { name: "みんなの入口" }).getByRole("button", { name: "今日の3人" }).click();
  await expect(modal).toBeVisible();
  // 見えているのは今のカードだけ（ほかのカードは読み上げからも外れている）
  const entry = modal.getByRole("button", { name: /さんにありがとうを送る$/ });
  await expect(entry).toBeVisible();
  const label = (await entry.getAttribute("aria-label")) ?? "";
  const name = label.replace(/さんにありがとうを送る$/, "");
  await entry.click();
  const sheet = page.getByRole("dialog", { name: `${name}さんへのサンクスカード` });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByLabel("届けることば")).toBeInViewport();
  await expect(sheet.locator("select")).toHaveCount(0);
});
