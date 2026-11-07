import { expect, test } from "@playwright/test";
import { switchPerson } from "./helpers";

test("仲間を探す画面はなくなり、入口もない", async ({ page }) => {
  expect((await page.goto("/nakama"))?.status()).toBe(404);
  await page.goto("/minna");
  await expect(page.getByRole("link", { name: "仲間を探す" })).toHaveCount(0);
});

test("最初の3人のあとは、めくると関係の深い人がおすすめの理由付きで出る", async ({ page }) => {
  await page.goto("/today");
  const reason = page.locator(".related-line");
  for (let i = 0; i < 6 && (await reason.count()) === 0; i++) {
    const next = page.getByRole("button", { name: "次へ" });
    if ((await next.count()) === 0) await page.getByRole("button", { name: /次のおすすめを見る/ }).first().click();
    else await next.click();
  }
  await expect(reason.first()).toContainText(/^おすすめ：.*(の話|できた投稿|やり取り|同じ|よく書く)/);
});

test("しばらく出さないは本人にだけ効き、相手には何も見えず、本人が「じぶん」から戻せる", async ({ page }) => {
  await page.goto("/");
  await switchPerson(page, "大河原 誠（英語・学年主任）");
  await page.goto("/today?view=popular");

  // 0-3p：今日の3人のカードからは「しばらく出さない」をなくし、払う操作に置き換えた。しばらく出さない仕組みそのものは残る
  await expect(page.getByRole("button", { name: "しばらく出さない" })).toHaveCount(0);
  const name = (await page.locator(".today-card .who strong").textContent()) ?? "";
  // 相手の ID は、人の切り替えの選択肢から読む
  await page.goto("/me?open=settings");
  const authorId = await page.getByLabel("試す人を切り替える").locator("option", { hasText: name }).getAttribute("value");
  expect(authorId).toBeTruthy();
  expect((await page.request.post("/api/hidden", { data: { personId: authorId, hidden: true } })).ok()).toBe(true);

  await page.goto("/today?view=popular");
  await expect(page.locator(".today-card .who strong").filter({ hasText: name })).toHaveCount(0);

  await page.goto("/me?open=settings");
  const list = page.getByRole("region", { name: "しばらく出していない人" });
  await expect(list).toContainText(name);

  // 相手の画面には、誰かに隠されたことが出ない
  await page.goto("/me?open=settings");
  const option = page.getByLabel("試す人を切り替える").locator("option", { hasText: name });
  await switchPerson(page, (await option.textContent()) ?? "");
  for (const path of ["/me", "/today"]) {
    await page.goto(path);
    await expect(page.getByText("大河原 誠").filter({ hasText: "しばらく" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "しばらく出していない人" })).toHaveCount(0);
  }

  await page.goto("/");
  await switchPerson(page, "大河原 誠（英語・学年主任）");
  await page.goto("/me?open=settings");
  await page.getByRole("region", { name: "しばらく出していない人" }).getByRole("button", { name: "また出す" }).click();
  await expect(page.getByRole("region", { name: "しばらく出していない人" })).toHaveCount(0);
});

test("生徒には生徒の「聞いてみる？」を出さず、チャネルを案内する", async ({ page }) => {
  await page.goto("/");
  await switchPerson(page, "青木 ひより（2年）");
  await page.goto("/chie");
  await page.getByRole("link", { name: "文化祭の動画を早く作る" }).click();
  await expect(page.getByRole("link", { name: "チャネルをのぞいてみる？" })).toBeVisible();
  const people = page.getByRole("region", { name: "言葉を使われた人" });
  await expect(people.locator("li", { hasText: "木下" }).getByRole("link", { name: "聞いてみる？" })).toHaveCount(0);
  await expect(people.locator("li", { hasText: "野田" }).getByRole("link", { name: "聞いてみる？" })).toBeVisible();
});
