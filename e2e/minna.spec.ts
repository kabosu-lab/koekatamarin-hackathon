import { expect, type Page, test } from "@playwright/test";
import { switchPerson } from "./helpers";

// 0-1k：みんなの画面。ページ全体が1つのスクロール、桜は上で帯に縮み、返信はその場で

/** 今日の3人のモーダルは、その日はじめて開いたときだけ出る。ふだんのテストでは出したことにしておく */
const TODAY_SEEN = { name: "koekata_today_seen", value: "1", domain: "127.0.0.1", path: "/" };

test.beforeEach(async ({ context }) => {
  await context.addCookies([TODAY_SEEN]);
});

test("スクロールすると桜が細い帯に縮んで上に残り、帯を押すと桜が開く", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/minna");
  const scroller = page.getByRole("region", { name: "みんな" });
  const band = page.getByRole("button", { name: "桜を大きく開く" });
  await expect(scroller).toHaveAttribute("data-shrunk", "false");

  // 画面の準備ができるまで、スクロールし直す
  await expect(async () => {
    await scroller.evaluate((element) => element.scrollTo(0, 600));
    await expect(scroller).toHaveAttribute("data-shrunk", "true", { timeout: 1000 });
  }).toPass();

  // 帯は 48px ほどで、窓の上の端に残る
  const box = await scroller.boundingBox();
  const bandBox = await band.boundingBox();
  expect(bandBox!.height).toBeLessThanOrEqual(56);
  expect(Math.abs(bandBox!.y - box!.y)).toBeLessThanOrEqual(10);
  await expect(band).toContainText(/葉\d+枚/);

  // 投稿が画面の大半を使う（上に残るのは帯と札の列だけ）
  const header = await page.locator(".minna-chip-row").boundingBox();
  expect(header!.y + header!.height - box!.y).toBeLessThan(box!.height * 0.2);

  await band.click();
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBe(0);
  await expect(scroller).toHaveAttribute("data-shrunk", "false");
});

test("カードの本文は途中で切らず全部出し、新しい投稿の欄は置かない", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/minna");
  const scroller = page.getByRole("region", { name: "みんな" });
  await expect(scroller.getByRole("article").first()).toBeVisible();
  const clipped = await page.locator(".minna-post-body").evaluateAll((bodies) =>
    bodies.filter((body) => {
      const style = getComputedStyle(body);
      return body.scrollHeight > body.clientHeight + 1 || (style.webkitLineClamp !== "none" && style.webkitLineClamp !== "");
    }).length,
  );
  expect(clipped).toBe(0);
  // 欄の中に入力欄はない。新しく話すのは「話す」画面から
  await expect(scroller.getByRole("textbox")).toHaveCount(0);
  await expect(scroller.getByRole("link", { name: "新しく話す →" })).toHaveAttribute("href", "/");
  // 中に小さなスクロール枠を作らない（スクロールするのは窓1つ）
  const inner = await scroller.evaluate(
    (root) =>
      [...root.querySelectorAll("*")].filter((element) => {
        const style = getComputedStyle(element);
        return /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1;
      }).length,
  );
  expect(inner).toBe(0);
});

test("返信を押すと下から欄がせり上がり、やめると閉じ、送ると返事がカードに並ぶ", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/minna");
  const scroller = page.getByRole("region", { name: "みんな" });
  const reply = scroller.getByRole("button", { name: "返信", exact: true }).first();
  const sheet = page.getByRole("dialog", { name: /さんへの返信$/ });

  await expect(async () => {
    await reply.click();
    await expect(sheet).toBeVisible({ timeout: 1000 });
  }).toPass();
  // 欄は画面の下の端にある
  const viewport = page.viewportSize()!;
  const sheetBox = await sheet.boundingBox();
  await expect.poll(async () => Math.round((await sheet.boundingBox())!.y + (await sheet.boundingBox())!.height)).toBeGreaterThanOrEqual(viewport.height - 2);
  expect(sheetBox!.width).toBeGreaterThan(300);
  await sheet.getByRole("button", { name: "やめる" }).click();
  await expect(sheet).toHaveCount(0);

  const words = `その場の返信 ${test.info().testId}`;
  await reply.click();
  await sheet.getByLabel("返信").fill(words);
  await sheet.getByRole("button", { name: "返信する" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(scroller.getByText(words)).toBeVisible();
});

test("チャネルの札で投稿を絞れ、教職員だけの札は生徒には出ない", async ({ page }) => {
  await page.goto("/minna");
  const chips = page.getByRole("group", { name: "チャネルで絞る" });
  const chip = chips.getByRole("button").nth(1);
  const name = (await chip.textContent()) ?? "";
  await expect(async () => {
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "true", { timeout: 1000 });
  }).toPass();
  const scroller = page.getByRole("region", { name: "みんな" });
  await expect(scroller.getByRole("article").first()).toBeVisible();
  // 絞ったあとに見えている投稿だけを見る（隠れた投稿も DOM には残る）
  for (const head of await scroller.locator("li:not([hidden]) article header.minna-post-head small").all()) {
    await expect(head).toContainText(name);
  }
  await chips.getByRole("button", { name: "すべて" }).click();
  await expect(chips.getByRole("button", { name: "すべて" })).toHaveAttribute("aria-pressed", "true");

  await switchPerson(page, "青木 ひより（2年）");
  await page.goto("/minna");
  await expect(page.getByRole("group", { name: "チャネルで絞る" }).getByRole("button", { name: "職員室" })).toHaveCount(0);
});

test("iPad の横向きと PC では、左に桜、右に投稿の2列で、桜は縮まない", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto("/minna");
  const scroller = page.getByRole("region", { name: "みんな" });
  const link = page.getByRole("link", { name: "校内の桜" });
  const post = scroller.getByRole("article").first();
  const sakura = await link.boundingBox();
  const first = await post.boundingBox();
  expect(sakura!.x + sakura!.width).toBeLessThanOrEqual(first!.x + 1);
  await page.locator(".minna-column").evaluate((column) => column.scrollTo(0, 800));
  await expect(scroller).toHaveAttribute("data-shrunk", "false");
  await expect(link).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
});

// 0-1y・0-2f：みんなは投稿が主役。上はチャネルの札だけ、入口はいちばん下のアイコンの帯だけ、下の縦の一覧はない

test("並びは桜 → チャネルの札 → 投稿で、入口はいちばん下に固定した帯の1か所だけ", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/minna");
  const scroller = page.getByRole("region", { name: "みんな" });
  const dock = page.getByRole("navigation", { name: "みんなの入口" });
  const sakura = (await page.getByRole("link", { name: "校内の桜" }).boundingBox())!;
  const chips = (await page.getByRole("group", { name: "チャネルで絞る" }).boundingBox())!;
  const post = (await scroller.getByRole("article").first().boundingBox())!;
  expect(sakura.y).toBeLessThan(chips.y);
  expect(chips.y).toBeLessThan(post.y);
  // 開いたらすぐ投稿が見える
  await expect(scroller.getByRole("article").first()).toBeInViewport();

  // 帯は窓の下、画面の切り替えの点の上。スクロールしても動かない
  const bar = (await dock.boundingBox())!;
  const frame = (await scroller.boundingBox())!;
  expect(bar.y).toBeGreaterThanOrEqual(frame.y + frame.height - 1);
  await scroller.evaluate((element) => element.scrollTo(0, 900));
  expect((await dock.boundingBox())!.y).toBeCloseTo(bar.y, 0);
  await expect(dock).toBeInViewport({ ratio: 1 });

  const items = dock.locator(":scope > *");
  await expect(items).toHaveCount(5);
  await expect(dock.getByRole("button", { name: "今日の3人" })).toBeVisible();
  await expect(dock.getByRole("link", { name: /受信箱/ })).toHaveAttribute("href", "/inbox");
  await expect(dock.getByRole("link", { name: /自習室/ })).toHaveAttribute("href", "/study/room");
  await expect(dock.getByRole("link", { name: "校内の知恵" })).toHaveAttribute("href", "/chie");
  // Teams はアプリの中の画面ではなく、本物の Teams を新しいタブで開く
  const teams = dock.getByRole("link", { name: "Teams を開く" });
  await expect(teams).toHaveAttribute("href", /^https:\/\/teams\.microsoft\.com\//);
  await expect(teams).toHaveAttribute("target", "_blank");
  // 上の札の列に、今日の3人と受信箱の札はない
  await expect(page.locator(".minna-chip-row").getByRole("link", { name: /受信箱/ })).toHaveCount(0);
  await expect(page.locator(".minna-chip-row").getByRole("button", { name: "今日の3人" })).toHaveCount(0);
  // 同じ入口を2か所に置かない
  await expect(page.locator(".minna-more")).toHaveCount(0);
  await expect(page.locator('a[href^="/teams"]').filter({ hasNotText: "で見る" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "今日の3人" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /校内チャネル（Teams）/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "一緒に勉強する", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /受信箱/ })).toHaveCount(1);
  // 大きなイベントのカードはない
  await expect(page.locator(".minna-event")).toHaveCount(0);
});

test("イベントは桜の木のそばのメガホンで知らせ、押すと小さなカードが出て、外を押すと閉じる", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/minna");
  // はじめての春の見通しは閉じておく（e2e/sakura.spec.ts で確かめる）
  await page.getByRole("note", { name: "春の見通し" }).getByRole("button", { name: "閉じる" }).click();
  const megaphone = page.getByRole("button", { name: "期間限定のイベントのお知らせ" });
  await expect(megaphone).toHaveCount(1);
  const card = page.getByRole("dialog", { name: "期間限定のイベント" });
  await expect(async () => {
    await megaphone.click();
    await expect(card).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(card).toContainText("テスト前の応援週間");
  await expect(card).toContainText("11月1日〜12月31日");
  await expect(card).toContainText("花びらが多めに舞っています");
  await expect(card).toContainText("期間限定のトロフィー「応援週間の仲間」");
  await page.mouse.click(10, 820);
  await expect(card).toHaveCount(0);

  // 桜が帯に縮んだら、帯の右端に同じメガホン
  const scroller = page.getByRole("region", { name: "みんな" });
  await expect(async () => {
    await scroller.evaluate((element) => element.scrollTo(0, 600));
    await expect(scroller).toHaveAttribute("data-shrunk", "true", { timeout: 1000 });
  }).toPass();
  await expect(megaphone).toHaveCount(1);
  const band = (await page.getByRole("button", { name: "桜を大きく開く" }).boundingBox())!;
  const small = (await megaphone.boundingBox())!;
  expect(small.x + small.width).toBeGreaterThan(band.x + band.width - 24);
  expect(Math.abs(small.y + small.height / 2 - (band.y + band.height / 2))).toBeLessThan(8);
  await megaphone.click();
  await expect(card).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(card).toHaveCount(0);
});

// 0-1x：その日はじめて「みんな」を開いたら、今日の3人をモーダルで出す

test.describe("今日の3人のモーダル", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies({ name: TODAY_SEEN.name });
  });

  /** カードの上で、指を左右か下へなでる */
  async function stroke(page: Page, dx: number, dy: number) {
    const box = (await page.getByRole("dialog", { name: "今日の3人" }).boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + 40;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(x + (dx * i) / 8, y + (dy * i) / 8);
    await page.mouse.up();
  }

  test("初めて開くと出て後ろが暗く沈み、なでるとめくれ、3人のあとにおすすめ、最後はおしまい", async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/minna");
    const modal = page.getByRole("dialog", { name: "今日の3人" });
    await expect(modal).toBeVisible();
    await expect(page.locator(".minna-today-scrim")).toHaveCSS("opacity", "0.55");
    // その日に出したことの印が残る
    await expect.poll(async () => (await context.cookies()).some((cookie) => cookie.name === TODAY_SEEN.name)).toBe(true);
    // 左右になでるのは、画面の切り替えとぶつからない
    await expect(page.locator(".minna-today-layer")).toHaveAttribute("data-noswipe");

    const count = modal.getByRole("img", { name: /枚目/ });
    await expect(count).toHaveAttribute("aria-label", /^1 枚目/);
    await expect(modal.getByRole("article")).toHaveCount(1);
    await expect(modal.getByRole("article").getByText("今日の3人", { exact: true })).toBeVisible();
    // 左へなでると次の人
    await expect(async () => {
      await stroke(page, -200, 0);
      await expect(count).toHaveAttribute("aria-label", /^2 枚目/, { timeout: 1000 });
    }).toPass();
    // 右へなでると戻る。画面は移らない
    await stroke(page, 200, 0);
    await expect(count).toHaveAttribute("aria-label", /^1 枚目/);
    await expect(page).toHaveURL(/\/minna$/);

    // 3人のあとは、関係のありそうな投稿が理由の一言付きで続く
    const total = Number((await count.getAttribute("aria-label"))!.match(/全 (\d+) 枚/)![1]);
    expect(total).toBeGreaterThan(4);
    for (let i = 1; i < total; i++) {
      if (i === 4) {
        await expect(modal.getByRole("article").getByText("あなたに関係のありそうな投稿")).toBeVisible();
        await expect(modal.getByRole("article").getByText(/^おすすめ：/)).toBeVisible();
      }
      await modal.getByRole("button", { name: "次へ" }).click();
      await expect(count).toHaveAttribute("aria-label", new RegExp(`^${i + 1} 枚目`));
    }
    await expect(modal.getByRole("heading", { name: "おしまい" })).toBeVisible();
    await expect(modal.getByRole("button", { name: "次へ" })).toBeDisabled();

    await modal.getByRole("button", { name: "みんなを見る" }).click();
    await expect(modal).toHaveCount(0);
    // 同じ日に開き直しても、自動では出ない
    await page.reload();
    await expect(page.getByRole("region", { name: "みんな" }).getByRole("article").first()).toBeVisible();
    await page.waitForTimeout(300);
    await expect(modal).toHaveCount(0);
    // 2回目からは入口から開く。外の暗い所を押すと閉じる
    await page.getByRole("navigation", { name: "みんなの入口" }).getByRole("button", { name: "今日の3人" }).click();
    await expect(modal).toBeVisible();
    await expect(count).toHaveAttribute("aria-label", /^1 枚目/);
    await page.mouse.click(195, 8);
    await expect(modal).toHaveCount(0);
  });

  test("カードからその場でいいねと返事ができ、下へなでおろすと閉じる", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/minna");
    const modal = page.getByRole("dialog", { name: "今日の3人" });
    const card = modal.getByRole("article");
    const like = card.getByRole("button", { name: /^いいね/ });
    await expect(async () => {
      await like.click();
      await expect(like).toHaveAttribute("aria-pressed", "true", { timeout: 1000 });
    }).toPass();

    const words = `モーダルからの返事 ${test.info().testId}`;
    await card.getByRole("button", { name: "返信", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: /さんへの返信$/ });
    await sheet.getByLabel("返信").fill(words);
    await sheet.getByRole("button", { name: "返信する" }).click();
    await expect(sheet).toHaveCount(0);
    // 返事を送ってもモーダルは開いたまま
    await expect(modal).toBeVisible();

    await stroke(page, 0, 240);
    await expect(modal).toHaveCount(0);
    await expect(page.getByRole("region", { name: "みんな" }).getByText(words)).toBeVisible();
  });

  test("生徒には職員室の投稿を出さない", async ({ page, context }) => {
    await switchPerson(page, "青木 ひより（2年）");
    await context.clearCookies({ name: TODAY_SEEN.name });
    await page.goto("/minna");
    const modal = page.getByRole("dialog", { name: "今日の3人" });
    await expect(modal).toBeVisible();
    const places = await page.locator(".minna-today-who small").allTextContents();
    expect(places.length).toBeGreaterThan(0);
    for (const place of places) expect(place).not.toContain("職員室");
  });

  for (const viewport of [
    { width: 820, height: 1180 },
    { width: 1180, height: 820 },
  ]) {
    test(`iPad（${viewport.width}×${viewport.height}）でも画面の中に収まり、はみ出さない`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/minna");
      const modal = page.getByRole("dialog", { name: "今日の3人" });
      await expect(modal).toBeInViewport({ ratio: 1 });
      expect((await modal.boundingBox())!.width).toBeLessThanOrEqual(26 * 16 + 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
      await modal.getByRole("button", { name: "みんなを見る" }).click();
      await expect(modal).toHaveCount(0);
    });
  }
});
