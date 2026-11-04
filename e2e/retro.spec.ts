import { expect, type Page, test } from "@playwright/test";

// 見た目を選んでいない人が、最初にどう見えるかを確かめる
test.use({ storageState: { cookies: [], origins: [] } });

async function asPerson(page: Page, id: string) {
  await page.context().addCookies([{ name: "koekata_person", value: id, domain: "127.0.0.1", path: "/" }]);
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
}

test("生徒はレトロから始まり、相棒と大きな3つのボタンがある", async ({ page }) => {
  await asPerson(page, "aoki");
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "retro");
  await expect(page.getByRole("img", { name: "青木 ひよりさんの相棒" })).toBeVisible();
  const actions = page.getByRole("navigation", { name: "すること" });
  await expect(actions.getByRole("link")).toHaveText(["はなす", "ようす", "とどける"]);
  await expect(page.getByRole("navigation", { name: "画面の切り替え" })).toBeHidden();
  // 一度にボタンまで見える
  const box = await actions.getByRole("link", { name: "はなす" }).boundingBox();
  expect(box && box.y + box.height <= page.viewportSize()!.height).toBe(true);
  expect(box && box.height >= 44).toBe(true);
  await noOverflow(page);
});

test("先生と大人はモダンのままで、ドット絵は出ない", async ({ page }) => {
  await asPerson(page, "saeki");
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "modern");
  await expect(page.locator(".pixel-companion")).toHaveCount(0);
  await expect(page.locator(".retro-home")).toHaveCount(0);
});

test("はなすは今までの話す流れで、約束も出て、下書きを確かめて送る", async ({ page }) => {
  await asPerson(page, "aoki");
  await page.goto("/");
  await page.getByRole("link", { name: "はなす" }).click();
  await expect(page.locator(".promise")).toContainText("要点だけを相談室の先生に伝えます");
  await page.getByRole("button", { name: "文字で書く" }).click();
  const words = `部活のことを話したい ${test.info().testId}`;
  await page.getByLabel("相棒に書く").fill(words);
  await page.getByRole("button", { name: "相棒に送る" }).click();
  await expect(page.getByRole("log").locator(".bubble.assistant").last()).toBeVisible();
  await page.getByRole("button", { name: "言葉にして送る" }).click();
  await expect(page.getByLabel("投稿の文章")).toHaveValue(words);
  await expect(page.getByRole("button", { name: "本人として送る" })).toBeVisible();
  await noOverflow(page);
});

test("とどけるは話す画面へ進み、確かめてから送ると伝える", async ({ page }) => {
  await asPerson(page, "aoki");
  await page.goto("/");
  await page.getByRole("link", { name: "とどける" }).click();
  await expect(page.locator(".daily-question")).toContainText("送るのは、確かめてから");
  await expect(page.locator(".talk")).toBeVisible();
});

test("命や安全の案内はレトロでも同じように出る", async ({ page }) => {
  await asPerson(page, "aoki");
  await page.goto("/?talk=1");
  await page.getByRole("button", { name: "文字で書く" }).click();
  await page.getByLabel("相棒に書く").fill("親に殴られている");
  await page.getByRole("button", { name: "相棒に送る" }).click();
  const card = page.getByRole("region", { name: "相談室に伝えました" });
  await expect(card).toContainText("0120-0-78310");
  await noOverflow(page);
});

test("ようすは姿と数を1画面で見せ、気分の推定は出さない", async ({ page }) => {
  await asPerson(page, "kinoshita");
  await page.goto("/");
  await page.getByRole("link", { name: "ようす" }).click();
  const list = page.locator(".yousu dl");
  for (const term of ["すがた", "ありがとう", "つないだ", "覚えたこと"]) await expect(list.getByText(term)).toBeVisible();
  await expect(page.locator("main")).not.toContainText("気分");
  await noOverflow(page);
});

test("設定から見た目を変えられて、データは同じまま", async ({ page }) => {
  await asPerson(page, "aoki");
  await page.goto("/yousu");
  const before = await page.locator(".yousu dl").innerText();
  await page.goto("/me");
  await page.getByRole("region", { name: "見た目" }).getByRole("button", { name: "モダン" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "modern");
  await page.goto("/");
  await expect(page.locator(".retro-home")).toHaveCount(0);
  await page.goto("/yousu");
  expect(await page.locator(".yousu dl").innerText()).toBe(before);
  await page.goto("/me");
  await page.getByRole("region", { name: "見た目" }).getByRole("button", { name: "ポップ" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "pop");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "話しかける" })).toBeVisible();
});

test("見た目を選ばない人でも、選んだ人の設定は人物をまたいで生きる", async ({ page }) => {
  await page.context().addCookies([{ name: "koekata_theme", value: "retro", domain: "127.0.0.1", path: "/" }]);
  await asPerson(page, "saeki");
  await page.goto("/");
  await expect(page.locator(".retro-home")).toBeVisible();
});
