import { expect, type Locator, type Page, test } from "@playwright/test";
import { PROMISE_SEEN } from "./promise-seen";
import { switchPerson } from "./helpers";

// 0-2b：履歴と設定の「これまで」。帯（第2段）と、押すと開くインフォグラフィック（0-2t で1画面に作り直し）

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

async function openStory(page: Page) {
  // トロフィーの知らせが出ていたら閉じる（押すとコレクションへ移るので Esc）
  if (await page.locator(".trophy-toast").isVisible().catch(() => false)) await page.keyboard.press("Escape");
  await page.getByRole("region", { name: "これまで" }).getByRole("button").click();
  const story = page.getByRole("dialog", { name: "これまで" });
  await expect(story).toBeVisible();
  return story;
}

async function closeStory(story: Locator) {
  await story.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(story).toBeHidden();
}

/** 棒の今の値 */
async function barValue(story: Locator, key: string) {
  return Number(await story.locator(`.so-far-bar[data-key="${key}"]`).getAttribute("data-to"));
}

test("全部のグラフを1画面に並べ、初めて見るときは 0 から伸び、2回目は動かず、増えた項目だけが前の値から伸びる", async ({ page }) => {
  await page.goto("/");
  await switchPerson(page, "野田 翔（情報・ものづくり部顧問）");
  await page.goto("/me");
  let story = await openStory(page);
  // 6場面を順に見せるのではなく、全部のグラフが同時に1枚に並ぶ
  for (const name of ["積み上がり", "届いた日", "つながり", "一言"]) await expect(story.getByRole("region", { name })).toBeVisible();
  await expect(story.getByText("押すと次へ")).toHaveCount(0);
  await expect(story.getByRole("link", { name: "ふりかえりを読む" })).toBeVisible();
  // 初めて見る端末：0 でない棒は全部 0 から伸びる。0 の棒は動かない
  const bars = story.locator(".so-far-bar");
  await expect(bars).toHaveCount(6);
  for (const bar of await bars.all()) {
    if ((await bar.getAttribute("data-zero")) !== null) {
      await expect(bar).not.toHaveAttribute("data-grew");
    } else {
      await expect(bar).toHaveAttribute("data-grew", "");
      await expect(bar).toHaveAttribute("data-from", "0");
    }
  }
  // 動き終わると、数え上がった数字は今の値ちょうど
  await expect(story.locator(".so-far-board")).toHaveAttribute("data-settled", "", { timeout: 5000 });
  for (const bar of await bars.all()) {
    if ((await bar.getAttribute("data-zero")) !== null) continue;
    await expect(bar.locator("strong")).toHaveText(String(await bar.getAttribute("data-to")));
  }
  await page.screenshot({ path: test.info().outputPath("so-far-board.png") });
  const posts = await barValue(story, "posts");
  const before = new Map<string, number>();
  for (const bar of await bars.all()) before.set(String(await bar.getAttribute("data-key")), Number(await bar.getAttribute("data-to")));
  await closeStory(story);

  // もう一度開いても、増えていなければ何も動かない（最初から今の値）。
  // 同じ人を使うほかのテストが並んで動くので、その間に本当に増えた項目だけは伸びてよい
  await page.goto("/me");
  story = await openStory(page);
  await expect(story.locator(".so-far-board")).toHaveAttribute("data-settled", "");
  for (const bar of await story.locator(".so-far-bar[data-grew]").all()) {
    const key = String(await bar.getAttribute("data-key"));
    expect(Number(await bar.getAttribute("data-from")), key).toBe(before.get(key));
    expect(Number(await bar.getAttribute("data-to")), key).toBeGreaterThan(before.get(key) ?? 0);
  }
  for (const bar of await story.locator(".so-far-bar:not([data-grew])").all()) {
    const key = String(await bar.getAttribute("data-key"));
    expect(Number(await bar.getAttribute("data-to")), key).toBe(before.get(key));
  }
  const comments = await barValue(story, "comments");
  await closeStory(story);

  // 1つ届けてから開くと、届けたの棒が前の値から伸びる
  const posted = await page.request.post("/api/publish", { data: { text: `これまでを確かめる投稿 ${test.info().testId}`, channelId: "study" } });
  expect(posted.ok()).toBe(true);
  await page.goto("/me");
  story = await openStory(page);
  const grown = story.locator('.so-far-bar[data-key="posts"]');
  await expect(grown).toHaveAttribute("data-grew", "");
  await expect(grown).toHaveAttribute("data-from", String(posts));
  await expect(grown).toHaveAttribute("data-to", String(posts + 1));
  // ほかのテストが同じ人に返事を入れていなければ、返したは動かない
  if ((await barValue(story, "comments")) === comments) {
    await expect(story.locator('.so-far-bar[data-key="comments"]')).not.toHaveAttribute("data-grew");
  }
  await expect(story.locator(".so-far-board")).toHaveAttribute("data-settled", "", { timeout: 5000 });
  await expect(grown.locator("strong")).toHaveText(String(posts + 1));
});

test("0 の項目は棒も下地も出さずに「これから」とだけ出す", async ({ page }) => {
  await page.goto("/");
  await switchPerson(page, "藤本 恵（教頭）");
  await page.goto("/me");
  const story = await openStory(page);
  const bars = story.locator(".so-far-bar");
  await expect(bars).toHaveCount(6);
  const shapes = await bars.evaluateAll((elements) =>
    elements.map((el) => ({
      zero: el.hasAttribute("data-zero"),
      fill: el.querySelector(".so-far-fill") !== null,
      label: el.querySelector("strong")?.textContent ?? "",
      background: getComputedStyle(el).backgroundColor,
      track: getComputedStyle(el.querySelector(".so-far-track")!).backgroundColor,
    })),
  );
  expect(shapes.some((shape) => shape.zero)).toBe(true);
  for (const shape of shapes) {
    expect(shape.background).toBe("rgba(0, 0, 0, 0)");
    expect(shape.track).toBe("rgba(0, 0, 0, 0)");
    expect(shape.fill).toBe(!shape.zero);
    if (shape.zero) expect(shape.label).toBe("これから");
  }
  // ほかのテストで藤本先生にやり取りが入っていなければ、はじまりの日の言葉が出る
  if (shapes.every((shape) => shape.zero)) await expect(story).toContainText("今日の一言が、最初の葉になる");
  await expect(story.getByText(/まだ0|なし|連続|順位/)).toHaveCount(0);
});

test("棒の高さは値に合わせ、値の大きい棒ほど高く、1 の棒も見える。下へなでると閉じる", async ({ page }) => {
  await page.goto("/");
  await switchPerson(page, "川村 陽菜（理科・1年副担任・生徒指導）");
  await page.goto("/me");
  const story = await openStory(page);
  await expect(story.locator(".so-far-board")).toHaveAttribute("data-settled", "", { timeout: 5000 });
  const shapes = await story.locator(".so-far-bar:not([data-zero])").evaluateAll((elements) =>
    elements.map((el) => ({
      value: Number(el.getAttribute("data-to")),
      height: el.querySelector(".so-far-fill")!.getBoundingClientRect().height,
    })),
  );
  expect(shapes.length).toBeGreaterThan(1);
  for (const shape of shapes) expect(shape.height).toBeGreaterThanOrEqual(5);
  const sorted = [...shapes].sort((x, y) => x.value - y.value);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].value > sorted[i - 1].value) expect(sorted[i].height).toBeGreaterThan(sorted[i - 1].height);
  }
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

const STORY_VIEWPORTS = [
  { name: "iPhone", width: 390, height: 844 },
  { name: "iPad縦", width: 820, height: 1180 },
  { name: "iPad横", width: 1180, height: 820 },
] as const;

for (const person of ["青木 ひより（2年）", "川村 陽菜（理科・1年副担任・生徒指導）", "藤本 恵（教頭）"]) {
  for (const viewport of STORY_VIEWPORTS) {
    test(`インフォグラフィックは ${viewport.name}（${viewport.width}×${viewport.height}）でスクロールなしに全部見える：${person.split("（")[0]}`, async ({
      page,
    }) => {
      await page.goto("/");
      await switchPerson(page, person);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/me");
      const story = await openStory(page);
      await expect(story.locator(".so-far-board")).toHaveAttribute("data-settled", "", { timeout: 5000 });
      await page.screenshot({ path: test.info().outputPath(`so-far-${viewport.width}x${viewport.height}.png`) });
      const fit = await story.evaluate((dialog) => {
        const over = (el: Element) => Math.max(el.scrollHeight - el.clientHeight, el.scrollWidth - el.clientWidth);
        const rect = dialog.getBoundingClientRect();
        return {
          body: over(dialog.querySelector(".bottom-sheet-body")!),
          dialog: Math.max(rect.bottom - innerHeight, rect.right - innerWidth),
          panels: [...dialog.querySelectorAll(".so-far-panel")].map((panel) => ({
            name: panel.getAttribute("aria-label"),
            over: Math.max(over(panel), over(panel.querySelector(".so-far-panel-body")!)),
          })),
          labels: [...dialog.querySelectorAll(".so-far-bar small")].map((label) => label.scrollWidth - label.parentElement!.clientWidth),
        };
      });
      expect(fit.body, "シートの中身").toBeLessThanOrEqual(1);
      expect(fit.dialog, "シート").toBeLessThanOrEqual(1);
      for (const panel of fit.panels) expect(panel.over, panel.name ?? "").toBeLessThanOrEqual(1);
      for (const label of fit.labels) expect(label, "棒の名前").toBeLessThanOrEqual(1);
    });
  }
}

test("動きを減らす設定では、何も動かさず最初から今の値で出す", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, reducedMotion: "reduce" });
  await context.addCookies([...PROMISE_SEEN, { name: "koekata_theme", value: "pop", domain: "127.0.0.1", path: "/" }]);
  const page = await context.newPage();
  await page.goto("/me");
  const story = await openStory(page);
  const board = story.locator(".so-far-board");
  await expect(board).toHaveAttribute("data-reduced", "");
  await expect(board).toHaveAttribute("data-settled", "");
  await expect(story.locator("[data-grew]")).toHaveCount(0);
  await expect(story.locator("[data-fresh]")).toHaveCount(0);
  for (const bar of await story.locator(".so-far-bar:not([data-zero])").all()) {
    await expect(bar.locator("strong")).toHaveText(String(await bar.getAttribute("data-to")));
  }
  await context.close();
});

// 見た目は1つになったので、案の「モダン」はパートナーを隠したとき（報酬を出さないとき）にあたる
test("パートナーを隠しているときは卵や枝の絵を描かず、葉の数を文字で出す", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  await context.addCookies([...PROMISE_SEEN, { name: "koekata_avatar", value: "hide", domain: "127.0.0.1", path: "/" }]);
  const page = await context.newPage();
  await page.goto("/me");
  const story = await openStory(page);
  await expect(story.locator(".so-far-board")).toHaveAttribute("data-settled", "", { timeout: 5000 });
  await expect(story.locator("svg")).toHaveCount(0);
  await expect(story).toContainText(/葉 \d+枚/);
  await context.close();
});

// 0-2q(7) の 0 の柱の確かめは、0-2t の「0 の項目は棒も下地もなく「これから」」に含まれる

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
