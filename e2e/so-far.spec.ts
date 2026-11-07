import { expect, type Frame, type Locator, type Page, test } from "@playwright/test";
import { PROMISE_SEEN } from "./promise-seen";
import { openScreen, switchPerson } from "./helpers";

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

async function openStory(page: Page | Frame) {
  // トロフィーの知らせが出ていたら閉じる（押すとコレクションへ移るので Esc）
  if (await page.locator(".trophy-toast").isVisible().catch(() => false)) await page.locator(".trophy-toast").press("Escape");
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
  for (const name of ["積み上がり", "届いた日", "つながり", "あなたの葉", "パートナーの育ち"]) {
    await expect(story.getByRole("region", { name })).toBeVisible();
  }
  // 0-3h：一言のカードはなくし、桜とパートナーは葉とパートナーの2つに分けた
  await expect(story.getByRole("region", { name: "一言" })).toHaveCount(0);
  await expect(story.getByRole("region", { name: "桜とパートナー" })).toHaveCount(0);
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
  { name: "パソコン", width: 1280, height: 800 },
] as const;

for (const person of ["青木 ひより（2年）", "川村 陽菜（理科・1年副担任・生徒指導）", "藤本 恵（教頭）", "大河原 誠（英語・学年主任）"]) {
  for (const viewport of STORY_VIEWPORTS) {
    test(`インフォグラフィックは ${viewport.name}（${viewport.width}×${viewport.height}）でスクロールなしに全部見える：${person.split("（")[0]}`, async ({
      page,
    }) => {
      await page.goto("/");
      await switchPerson(page, person);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      // 0-2y (6)：横向きでは、履歴と設定は3列の左の列の中。インフォグラフィックも列の中に収まる
      const screen = await openScreen(page, "/me");
      const story = await openStory(screen);
      await expect(story.locator(".so-far-board")).toHaveAttribute("data-settled", "", { timeout: 5000 });
      // 0-3h：3列（横向き）では、左の列の中から3列の上に全画面で重ねて開く
      if (viewport.width > viewport.height) {
        await expect(page.locator('iframe[title="履歴と設定"]')).toHaveAttribute("data-so-far-full", "true");
        const box = (await page.locator('iframe[title="履歴と設定"]').boundingBox())!;
        expect(Math.round(box.x)).toBe(0);
        expect(Math.round(box.width)).toBe(viewport.width);
        expect(Math.round(box.height)).toBe(viewport.height);
      }
      await page.screenshot({ path: test.info().outputPath(`so-far-${viewport.width}x${viewport.height}.png`) });
      const fit = await story.evaluate((dialog) => {
        const over = (el: Element) => Math.max(el.scrollHeight - el.clientHeight, el.scrollWidth - el.clientWidth);
        const rect = dialog.getBoundingClientRect();
        return {
          body: over(dialog.querySelector(".bottom-sheet-body")!),
          // 0-3h：ワードクラウドの名前も切れずに収まる
          cloud: over(dialog.querySelector(".so-far-cloud") ?? dialog),
          dialog: Math.max(rect.bottom - innerHeight, rect.right - innerWidth),
          panels: [...dialog.querySelectorAll(".so-far-panel")].map((panel) => ({
            name: panel.getAttribute("aria-label"),
            over: Math.max(over(panel), over(panel.querySelector(".so-far-panel-body")!)),
          })),
          labels: [...dialog.querySelectorAll(".so-far-bar small")].map((label) => label.scrollWidth - label.parentElement!.clientWidth),
        };
      });
      expect(fit.body, "シートの中身").toBeLessThanOrEqual(1);
      expect(fit.cloud, "つながりの名前").toBeLessThanOrEqual(1);
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

test("0-3h：3列（iPad 横・パソコン）では、押したときだけ3列の上に全画面で重ね、閉じると3列に戻る", async ({ page }) => {
  for (const size of [
    { width: 1180, height: 820 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(size);
    await page.goto("/");
    const frameElement = page.locator('iframe[title="履歴と設定"]');
    await expect(frameElement).toBeVisible();
    const column = (await frameElement.boundingBox())!;
    expect(column.width).toBeLessThan(size.width / 2);
    const frame = (await (await frameElement.elementHandle())!.contentFrame())!;
    const story = await openStory(frame);
    await expect(frameElement).toHaveAttribute("data-so-far-full", "true");
    const full = (await frameElement.boundingBox())!;
    expect(Math.round(full.width)).toBe(size.width);
    expect(Math.round(full.height)).toBe(size.height);
    // 真ん中の話す画面と右の列は、そのまま裏に残る。広げている間は、Tab や読み上げが裏へ抜けない（inert）
    await expect(page.locator(".device-row > .retro-home")).toHaveCount(1);
    await expect(page.locator('iframe[title="みんな"]')).toHaveCount(1);
    await expect(page.locator(".device-row > .retro-home")).toHaveAttribute("inert", "");
    await expect(page.locator('.device-row > .wide-panel[data-side="right"]')).toHaveAttribute("inert", "");
    await closeStory(story);
    await expect(frameElement).not.toHaveAttribute("data-so-far-full", "true");
    await expect(page.locator(".device-row > .retro-home")).not.toHaveAttribute("inert", "");
    await expect(page.locator('.device-row > .wide-panel[data-side="right"]')).not.toHaveAttribute("inert", "");
    const back = (await frameElement.boundingBox())!;
    expect(Math.round(back.width)).toBe(Math.round(column.width));
    expect(Math.round(back.x)).toBe(Math.round(column.x));
  }
});

test("0-3h：どのグラフも、押すと意味の一文が出て、もう一度押すか外を押すと消える", async ({ page }) => {
  await page.goto("/");
  await switchPerson(page, "川村 陽菜（理科・1年副担任・生徒指導）");
  await page.goto("/me");
  const story = await openStory(page);
  await expect(story.locator(".so-far-board")).toHaveAttribute("data-settled", "", { timeout: 5000 });
  const tip = story.locator(".so-far-tip");
  for (const name of ["積み上がり", "届いた日", "つながり", "あなたの葉", "パートナーの育ち"]) {
    await story.getByRole("region", { name }).getByRole("button", { name, exact: true }).click();
    await expect(tip).toHaveCount(1);
    await expect(tip).toContainText(`${name}：`);
    // もう一度押すと消える
    await story.getByRole("region", { name }).getByRole("button", { name, exact: true }).click();
    await expect(tip).toHaveCount(0);
  }
  // 棒も1本ずつ意味が出る。外（いつからの行）を押すと消える
  const labels: Record<string, string> = { posts: "届けた", comments: "返した", cheers: "応援", goals: "解決", assists: "つないだ", thanks: "ありがとう" };
  for (const [key, label] of Object.entries(labels)) {
    await story.locator(`.so-far-bar[data-key="${key}"]`).click();
    await expect(tip).toContainText(`${label}：`);
    await expect(tip).toContainText("増え");
  }
  await story.locator(".so-far-since").click();
  await expect(tip).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("so-far-tip.png") });
});

test("0-3h：つながりはワードクラウドで、名前の大きさはやり取りの数に合い、押すと名札が出る", async ({ page }) => {
  await page.goto("/");
  await switchPerson(page, "青木 ひより（2年）");
  await page.goto("/me");
  const story = await openStory(page);
  await expect(story.locator(".so-far-board")).toHaveAttribute("data-settled", "", { timeout: 5000 });
  const cloud = story.getByRole("region", { name: "つながり" });
  // 自分は真ん中に置かない
  await expect(cloud).not.toContainText("あなた");
  const names = cloud.locator(".so-far-name");
  const shapes = await names.evaluateAll((elements) =>
    elements.map((el) => ({ weight: Number(el.getAttribute("data-weight")), size: parseFloat(getComputedStyle(el).fontSize) })),
  );
  expect(shapes.length).toBeGreaterThan(0);
  for (const a of shapes) {
    for (const b of shapes) if (a.weight > b.weight) expect(a.size, `${a.weight} > ${b.weight}`).toBeGreaterThan(b.size);
  }
  // 名札：名前・肩書・事実の数だけ
  for (const name of await names.all()) {
    await name.click();
    const tag = story.locator(".so-far-tip");
    await expect(tag).toContainText(String(await name.textContent()));
    await expect(tag).toContainText(/(ありがとうをもらった|ありがとうを送った|返事をもらった|返事をした|日報に一言をもらった|回した) \d+回/);
    // 数の合計は名前の重さと同じ
    const counts = [...String(await tag.textContent()).matchAll(/(\d+)回/g)].map((match) => Number(match[1]));
    expect(counts.reduce((sum, n) => sum + n, 0)).toBe(Number(await name.getAttribute("data-weight")));
    await page.screenshot({ path: test.info().outputPath("so-far-tag.png") });
    // もう一度押すと消える（名札が名前に重なっているときは、名札を押す）
    await tag.click();
    await expect(tag).toHaveCount(0);
  }
});

test("0-3h：生徒の画面のワードクラウドに、やり取りのない先生は出ない", async ({ page }) => {
  await page.goto("/");
  await switchPerson(page, "中村 結衣（1年・吹奏楽部）");
  await page.goto("/me");
  const story = await openStory(page);
  const names = story.getByRole("region", { name: "つながり" }).locator(".so-far-name");
  // 出ている人は、どの人もやり取りが1回以上ある
  for (const name of await names.all()) expect(Number(await name.getAttribute("data-weight"))).toBeGreaterThan(0);
  // 生徒から先生へ、回しただけ（先生が何もしていない）の先生は出ない（数え方は src/lib/so-far.test.ts で確かめる）
  const teachers = ["藤本 恵", "野田 翔", "白石 文", "大河原 誠", "佐伯 みどり", "川村 陽菜"];
  const shown = (await names.allTextContents()).filter((text) => teachers.includes(text));
  for (const teacher of shown) {
    await names.filter({ hasText: teacher }).click();
    await expect(story.locator(".so-far-tip")).not.toHaveText(/^[^・]*回した \d+回$/);
    await story.locator(".so-far-tip").click();
    await expect(story.locator(".so-far-tip")).toHaveCount(0);
  }
});

test("0-3h：つながりの箱に収まらない人は、多い順に残して「ほか N 人」にまとめ、箱が変わると測り直す", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await switchPerson(page, "大河原 誠（英語・学年主任）");
  await page.goto("/me");
  const story = await openStory(page);
  await expect(story.locator(".so-far-board")).toHaveAttribute("data-settled", "", { timeout: 5000 });
  const cloud = story.locator(".so-far-cloud");
  const total = (await cloud.locator(".so-far-name").count()) + Number(await cloud.getAttribute("data-more"));
  expect(total).toBeGreaterThan(1);
  // 箱を小さくすると、収まる人数まで減り、残りは「ほか N 人」
  await page.addStyleTag({ content: '.so-far-panel[data-panel="people"] { flex: none; height: 120px; }' });
  await expect(cloud.locator(".so-far-more-people")).toBeVisible();
  const weights = await cloud.locator(".so-far-name").evaluateAll((elements) => elements.map((el) => Number(el.getAttribute("data-weight"))));
  const more = Number(await cloud.getAttribute("data-more"));
  expect(weights.length + more).toBe(total);
  await expect(cloud.locator(".so-far-more-people")).toHaveText(`ほか ${more} 人`);
  const over = await cloud.evaluate((el) => Math.max(el.scrollHeight - el.clientHeight, el.scrollWidth - el.clientWidth));
  expect(over).toBeLessThanOrEqual(1);
});

test("0-3h：広げたまま列の中が読み直されても、3列に戻る", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const frameElement = page.locator('iframe[title="履歴と設定"]');
  await expect(frameElement).toBeVisible();
  const frame = (await (await frameElement.elementHandle())!.contentFrame())!;
  await openStory(frame);
  await expect(frameElement).toHaveAttribute("data-so-far-full", "true");
  await frame.evaluate(() => location.reload());
  await expect(frameElement).not.toHaveAttribute("data-so-far-full", "true");
  await expect(page.locator(".device-row > .retro-home")).not.toHaveAttribute("inert", "");
  expect((await frameElement.boundingBox())!.width).toBeLessThan(640);
});

test("0-3h：一文や名札を開いているときの Esc は、それだけを閉じ、シートは閉じない", async ({ page }) => {
  await page.goto("/");
  await switchPerson(page, "川村 陽菜（理科・1年副担任・生徒指導）");
  await page.goto("/me");
  const story = await openStory(page);
  await story.locator('.so-far-bar[data-key="posts"]').click();
  await expect(story.locator(".so-far-tip")).toHaveCount(1);
  // 読み上げの知らせは、いつも置いてある入れ物の中身が替わる
  await expect(story.getByRole("status")).toContainText("届けた：");
  await page.keyboard.press("Escape");
  await expect(story.locator(".so-far-tip")).toHaveCount(0);
  await expect(story).toBeVisible();
  await expect(story.getByRole("status")).toHaveText("");
  await page.keyboard.press("Escape");
  await expect(story).toBeHidden();
});
