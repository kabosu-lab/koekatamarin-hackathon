import { expect, type Locator, type Page, test } from "@playwright/test";
import { PROMISE_SEEN } from "./promise-seen";
import { switchPerson } from "./helpers";

// 0-2b：履歴と設定の「これまで」。帯（第2段）と、押すと開くインフォグラフィック（第3段）

test("「これまで」の帯は、前に見たときから増えた数だけが転がり、増えていなければ動かない", async ({ page }) => {
  await page.goto("/");
  await switchPerson(page, "青木 ひより（2年）");
  await page.goto("/me");
  const band = page.getByRole("region", { name: "これまで" });
  await expect(band).toContainText(/届けた \d+/);
  await expect(band).toContainText(/ありがとう \d+/);

  // もう一度開いても、増えていなければ転がらない
  await page.goto("/me");
  await expect(band).toBeVisible();
  await page.waitForTimeout(800);
  await expect(page.locator(".me-so-far[data-rolling]")).toHaveCount(0);
  await expect(band.locator(".so-far-up")).toHaveCount(0);

  // 1つ届けてから開くと、届けたが1つ転がる
  const posted = await page.request.post("/api/publish", { data: { text: `帯を確かめる投稿 ${test.info().testId}`, channelId: "study" } });
  expect(posted.ok()).toBe(true);
  await page.goto("/me");
  await expect(page.locator(".me-so-far[data-rolling]")).toHaveCount(1);
  await expect(band.locator(".so-far-up")).toHaveText("▲+1");
  await expect(band.locator(".so-far-item", { has: page.locator(".so-far-up") })).toContainText("届けた");
  // 転がり終わると、ただの数に戻る
  await expect(page.locator(".me-so-far[data-rolling]")).toHaveCount(0, { timeout: 5000 });
});

/** 場面の上をそのまま押す（場面の中は動き続けるので、止まるのを待たずに指で押すのと同じに） */
async function tap(page: Page, scene: Locator) {
  const box = (await scene.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + 40);
}

async function openStory(page: Page) {
  // トロフィーの知らせが出ていたら閉じる（押すとコレクションへ移るので Esc）
  if (await page.locator(".trophy-toast").isVisible().catch(() => false)) await page.keyboard.press("Escape");
  await page.getByRole("region", { name: "これまで" }).getByRole("button").click();
  const story = page.getByRole("dialog", { name: "これまで" });
  await expect(story).toBeVisible();
  return story;
}

test("帯を押すとインフォグラフィックが開き、押すたびに場面が1から6へ進み、下へなでると閉じる", async ({ page }) => {
  await page.goto("/");
  await switchPerson(page, "川村 陽菜（理科・1年副担任・生徒指導）");
  await page.goto("/me");
  const story = await openStory(page);
  const scene = story.locator("[data-scene]");
  await expect(scene).toHaveAttribute("data-scene", "1");
  await page.waitForTimeout(400);
  await page.screenshot({ path: test.info().outputPath("so-far-1.png") });
  // 描き終わりを撮る。場面の長さ（②2.8s ③2.0s ④2.5s ⑤2.5s）より短く待ち、押して次へ
  const settle: Record<string, number> = { "2": 2200, "3": 1300, "4": 1800, "5": 1800, "6": 800 };
  for (const next of ["2", "3", "4", "5", "6"]) {
    await tap(page, scene);
    await expect(scene).toHaveAttribute("data-scene", next);
    await page.waitForTimeout(settle[next]);
    await page.screenshot({ path: test.info().outputPath(`so-far-${next}.png`) });
  }
  // 終わりは2つだけ
  await expect(story.getByRole("link", { name: "ふりかえりを読む" })).toBeVisible();
  await expect(story.getByRole("button", { name: "閉じる", exact: true })).toBeVisible();
  // 順位や連続の言葉は出さない
  await expect(story.getByText(/連続|順位|位$/)).toHaveCount(0);

  // 取っ手を下へなでおろすと閉じる
  const grip = story.locator(".bottom-sheet-grip");
  const box = (await grip.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 60, { steps: 4 });
  await page.mouse.move(x, y + 160, { steps: 4 });
  await page.mouse.up();
  await expect(story).toBeHidden();
});

test("押さなくても場面は進み、最後で止まる", async ({ page }) => {
  await page.goto("/");
  await switchPerson(page, "川村 陽菜（理科・1年副担任・生徒指導）");
  await page.goto("/me");
  const story = await openStory(page);
  await expect(story.locator("[data-scene]")).toHaveAttribute("data-scene", "3", { timeout: 6000 });
  await expect(story.locator("[data-scene]")).toHaveAttribute("data-scene", "6", { timeout: 14_000 });
  await expect(story.getByRole("link", { name: "ふりかえりを読む" })).toBeVisible();
});

test("まだ何もない人は「はじまりの日」の場面になり、「まだ0」や「なし」は出ない", async ({ page }) => {
  await page.goto("/");
  await switchPerson(page, "藤本 恵（教頭）");
  await page.goto("/me");
  const story = await openStory(page);
  const scene = story.locator("[data-scene]");
  await tap(page, scene);
  // 全部のテストを同時に流すと、ほかのテストで藤本先生にやり取りが入ることがある。そのときは確かめられない
  await page.waitForTimeout(300);
  test.skip((await scene.getAttribute("data-scene")) !== "start", "ほかのテストでやり取りが入った");
  await expect(scene).toHaveAttribute("data-scene", "start");
  await expect(story).toContainText("今日の一言が、最初の葉になる");
  await page.waitForTimeout(800);
  await page.screenshot({ path: test.info().outputPath("so-far-empty.png") });
  await tap(page, scene);
  await expect(scene).toHaveAttribute("data-scene", "6");
  await expect(story.getByText(/まだ0|なし|連続|順位/)).toHaveCount(0);
});

// 見た目は1つになったので、案の「モダン」はパートナーを隠したとき（報酬を出さないとき）にあたる
test("パートナーを隠しているときは卵や枝の絵を描かず、葉の数を文字で出す", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  await context.addCookies([...PROMISE_SEEN, { name: "koekata_avatar", value: "hide", domain: "127.0.0.1", path: "/" }]);
  const page = await context.newPage();
  await page.goto("/me");
  const story = await openStory(page);
  const scene = story.locator("[data-scene]");
  for (const next of ["2", "3", "4", "5"]) {
    await tap(page, scene);
    await expect(scene).toHaveAttribute("data-scene", next);
    await expect(story.locator("svg")).toHaveCount(0);
    if (next === "5") await expect(story).toContainText(/葉 \d+枚/);
  }
  await context.close();
});

test("0-2q(7)：積み上がりで、0 の項目に縦長の薄い柱を出さない", async ({ page }) => {
  await page.goto("/");
  await switchPerson(page, "青木 ひより（2年）");
  await page.goto("/me");
  const story = await openStory(page);
  const scene = story.locator("[data-scene]");
  await tap(page, scene);
  await expect(scene).toHaveAttribute("data-scene", "2");
  for (const bar of await story.locator(".so-far-bar[data-helped]").all()) {
    await expect(bar).toHaveCSS("background-image", "none");
    await expect(bar).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  }
});

test("0-2q(9)：iPad 横の左の欄でも「これまで」の帯は2段に収まり、縦長に折れない", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto("/");
  const panel = page.frameLocator('iframe[title="履歴と設定"]');
  const band = panel.getByRole("region", { name: "これまで" });
  await expect(band).toBeVisible();
  const rows = band.locator(".so-far-row");
  await expect(rows).toHaveCount(2);
  for (const row of await rows.all()) {
    const items = await row.locator(".so-far-item").all();
    const tops = await Promise.all(items.map(async (item) => Math.round((await item.boundingBox())!.y)));
    // 1段の3つは同じ高さに並ぶ
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(2);
  }
});
