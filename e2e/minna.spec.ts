import { type Browser, expect, type Page, test } from "@playwright/test";
import { openScreen, switchPerson } from "./helpers";

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

  // 投稿が画面の大半を使う（上に残るのは帯と見出しの行だけ）
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

test("0-2m：返信を話している間は音を鳴らさず、話し終えたときに鈴をまとめて鳴らす", async ({ page }) => {
  await page.addInitScript(() => {
    const store = window as unknown as Record<string, unknown>;
    store.oscillators = 0;
    const proto = BaseAudioContext.prototype;
    const make = proto.createOscillator;
    proto.createOscillator = function (this: BaseAudioContext) {
      store.oscillators = (store.oscillators as number) + 1;
      return make.call(this);
    };
    class FakeRecognition {
      onresult: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      continuous = false;
      start() {
        store.current = this;
      }
      stop() {
        this.onend?.();
      }
      say(text: string) {
        this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal: true })] });
      }
    }
    Object.assign(window, { webkitSpeechRecognition: FakeRecognition, SpeechRecognition: FakeRecognition });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/minna");
  const scroller = page.getByRole("region", { name: "みんな" });
  const reply = scroller.getByRole("button", { name: "返信", exact: true }).first();
  const sheet = page.getByRole("dialog", { name: /さんへの返信$/ });
  await expect(async () => {
    await reply.click();
    await expect(sheet).toBeVisible({ timeout: 1000 });
  }).toPass();
  await sheet.getByRole("button", { name: "話す" }).click();
  await expect(sheet.getByRole("button", { name: "止める" })).toBeVisible();
  const oscillators = () => page.evaluate(() => (window as unknown as { oscillators: number }).oscillators);
  const before = await oscillators();
  await page.evaluate(() => (window as unknown as { current: { say(text: string): void } }).current.say("いいね"));
  await expect(sheet.getByLabel("返信")).toHaveValue("いいね");
  await page.waitForTimeout(300);
  // 話している間は鳴らさない
  expect(await oscillators()).toBe(before);
  await sheet.getByRole("button", { name: "止める" }).click();
  await expect.poll(oscillators).toBeGreaterThan(before);
});

/** 決まった人で開く、別の窓（今日の3人は出したことにしておく） */
async function openAs(browser: Browser, personId: string) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies([TODAY_SEEN, { name: "koekata_person", value: personId, domain: "127.0.0.1", path: "/" }]);
  const page = await context.newPage();
  await page.goto("/");
  return page;
}

const TIER_RANK = { related: 0, card: 1, popular: 2, new: 3 } as const;

// 0-3e：チャネルの札もタブも置かず、「おすすめ」の1本の流れ

test("チャネルの札の列はなく、見出しは「おすすめ」だけ。チャネル名は小さく出て、押すとそのチャネルを開く", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/minna");
  const scroller = page.getByRole("region", { name: "みんな" });
  await expect(scroller.getByRole("article").first()).toBeVisible();
  await expect(page.getByRole("group", { name: "チャネルで絞る" })).toHaveCount(0);
  await expect(page.locator(".minna-chips, .minna-chip")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "すべて" })).toHaveCount(0);
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(scroller.getByRole("heading", { name: "おすすめ", exact: true })).toBeVisible();
  await expect(scroller.getByRole("list", { name: "おすすめ" })).toBeVisible();
  // 「〇〇で見る」のリンクは置かず、見出しの行のチャネル名がその入口
  await expect(scroller.getByRole("link", { name: /で見る$/ })).toHaveCount(0);
  const article = scroller.getByRole("article").first();
  const channel = article.locator(".minna-post-head small a.minna-post-channel");
  await expect(channel).toHaveCount(1);
  const name = ((await channel.textContent()) ?? "").trim();
  expect(name.length).toBeGreaterThan(0);
  // テストは Teams につないでいないので、アプリの校内チャネルの画面のその投稿へ
  expect(await channel.getAttribute("href")).toMatch(/^\/teams\?channel=[^#]+#post-/);
  const size = (selector: string) => article.locator(selector).first().evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  expect(await size("a.minna-post-channel")).toBeLessThan(await size(".minna-post-body"));
  await channel.click();
  await expect(page).toHaveURL(/\/teams\?channel=/);
  await expect(page.getByRole("heading", { name, exact: true }).first()).toBeVisible();
});

test("おすすめは、自分へのメンション → カード → 反応の多いもの → 新しいもの の順", async ({ browser }) => {
  const id = test.info().testId;
  // 木下さん（3年・ものづくり部）は、中村さん（1年・吹奏楽部）と学年も部活も重ならない
  const author = await openAs(browser, "kinoshita");
  const publish = (data: Record<string, unknown>) => author.request.post("/api/publish", { data: { channelId: "study", ...data } });
  expect((await publish({ text: `中村さんに聞きたい譜面の読み方 ${id}`, askedPersonId: "nakamura" })).ok()).toBe(true);
  expect((await publish({ text: `資料のお礼 ${id}`, subject: "【ありがとう】資料を見せてくれて", askedPersonId: "aoki" })).ok()).toBe(true);
  expect((await publish({ text: `ふつうの新しい話 ${id}` })).ok()).toBe(true);
  await author.context().close();

  const page = await openAs(browser, "nakamura");
  await page.goto("/minna");
  const list = page.getByRole("region", { name: "みんな" }).getByRole("list", { name: "おすすめ" });
  const articles = list.getByRole("article");
  await expect(articles.first()).toBeVisible();
  const rows = await articles.evaluateAll((elements) => elements.map((element) => ({ tier: element.getAttribute("data-tier") ?? "", text: element.textContent ?? "" })));
  // 段は上から順に並び、戻らない
  const ranks = rows.map((row) => TIER_RANK[row.tier as keyof typeof TIER_RANK]);
  expect(ranks.every((rank) => rank !== undefined)).toBe(true);
  expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  const at = (words: string) => rows.findIndex((row) => row.text.includes(words));
  const mention = at(`中村さんに聞きたい譜面の読み方 ${id}`);
  const card = at(`資料のお礼 ${id}`);
  expect(rows[mention].tier).toBe("related");
  expect(rows[card].tier).toBe("card");
  expect(mention).toBeLessThan(card);
  // 反応のあった投稿（はじめの投稿にいいねや返事がある）は、カードのあと
  const popular = rows.findIndex((row) => row.tier === "popular");
  expect(popular).toBeGreaterThan(card);
  // 反応のない新しい投稿は、いちばん後ろの段（数をしぼって出ないこともある）
  const fresh = at(`ふつうの新しい話 ${id}`);
  if (fresh >= 0) {
    expect(rows[fresh].tier).toBe("new");
    expect(fresh).toBeGreaterThan(popular);
  }
  await page.context().close();
});

test("生徒のおすすめには、教職員だけのチャネルの投稿は出ない", async ({ browser }) => {
  const words = `職員室だけの連絡 ${test.info().testId}`;
  const teacher = await openAs(browser, "saeki");
  expect((await teacher.request.post("/api/publish", { data: { text: words, channelId: "staffroom" } })).ok()).toBe(true);
  await teacher.goto("/minna");
  // 先生には、送ったばかりの自分の投稿として上の方に出る
  const own = teacher.getByRole("article").filter({ hasText: words });
  await expect(own).toBeVisible();
  await expect(own.locator(".minna-post-head small")).toContainText("職員室");
  await teacher.context().close();

  const student = await openAs(browser, "aoki");
  await student.goto("/minna");
  await expect(student.getByRole("region", { name: "みんな" }).getByRole("article").first()).toBeVisible();
  await expect(student.getByRole("article").filter({ hasText: words })).toHaveCount(0);
  await expect(student.locator(".minna-post-head small", { hasText: "職員室" })).toHaveCount(0);
  await student.context().close();
});

// 0-2y (6)：横向きは必ず3列で、みんなは右の列の中（e2e/wide-columns.spec.ts）。前の「横長の1画面で桜と投稿の2列」は、もう出ない

// 0-1y・0-2f・0-3e：みんなは投稿が主役。上は見出し「おすすめ」だけ、入口はいちばん下のアイコンの帯だけ、下の縦の一覧はない

test("並びは桜 → 見出し「おすすめ」 → 投稿で、入口はいちばん下に固定した帯の1か所だけ", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/minna");
  const scroller = page.getByRole("region", { name: "みんな" });
  const dock = page.getByRole("navigation", { name: "みんなの入口" });
  const sakura = (await page.getByRole("link", { name: "校内の桜" }).boundingBox())!;
  const heading = (await scroller.getByRole("heading", { name: "おすすめ", exact: true }).boundingBox())!;
  const post = (await scroller.getByRole("article").first().boundingBox())!;
  expect(sakura.y).toBeLessThan(heading.y);
  expect(heading.y).toBeLessThan(post.y);
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
  // 0-2q(6)：Teams につないでいない（テストは Teams オフ）ので、Teams は帯に置かない
  await expect(items).toHaveCount(4);
  await expect(dock.getByRole("button", { name: "今日の3人" })).toBeVisible();
  await expect(dock.getByRole("link", { name: /受信箱/ })).toHaveAttribute("href", "/inbox");
  await expect(dock.getByRole("link", { name: /自習室/ })).toHaveAttribute("href", "/study/room");
  await expect(dock.getByRole("link", { name: "校内の知恵" })).toHaveAttribute("href", "/chie");
  // Teams につないでいるときだけ、本物の Teams を新しいタブで開く入口を置く（src/app/minna/teams-link.test.ts）
  await expect(dock.getByRole("link", { name: "Teams を開く" })).toHaveCount(0);
  // 上の札の列に、今日の3人と受信箱の札はない
  await expect(page.locator(".minna-chip-row").getByRole("link", { name: /受信箱/ })).toHaveCount(0);
  await expect(page.locator(".minna-chip-row").getByRole("button", { name: "今日の3人" })).toHaveCount(0);
  // 同じ入口を2か所に置かない
  await expect(page.locator(".minna-more")).toHaveCount(0);
  // 校内チャネルの画面へのリンクは、投稿のチャネル名だけ
  await expect(page.locator('a[href^="/teams"]:not(.minna-post-channel)')).toHaveCount(0);
  await expect(page.getByRole("link", { name: "今日の3人" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /校内チャネル（Teams）/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "一緒に勉強する", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /受信箱/ })).toHaveCount(1);
  // 大きなイベントのカードはない
  await expect(page.locator(".minna-event")).toHaveCount(0);
});

test("イベントは桜の木のそばのメガホンで知らせ、押すと小さなカードが出て、外を押すと閉じる", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // 0-2q(4)：重なりはレトロ（生徒の初期）で出ていたので、レトロで見る
  await page.context().addCookies([{ name: "koekata_theme", value: "retro", domain: "127.0.0.1", path: "/" }]);
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
  // 0-2q(4)：レトロでも帯の右はメガホンの分だけ空き、「桜を開く」がメガホンに重ならない
  const right = await page.getByRole("button", { name: "桜を大きく開く" }).evaluate((element) => parseFloat(getComputedStyle(element).paddingRight));
  expect(band.width - right).toBeLessThanOrEqual(small.x - band.x + 1);
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

  test("先生で開くと、1枚目は理由つきの生徒の投稿。焦点がカードの外にあっても Escape で閉じる", async ({ page, context }) => {
    await context.addCookies([{ name: "koekata_person", value: "saeki", domain: "127.0.0.1", path: "/" }]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/minna");
    const modal = page.getByRole("dialog", { name: "今日の3人" });
    await expect(modal).toBeVisible();
    const first = modal.getByRole("article").first();
    await expect(first.locator(".minna-today-reason")).toContainText("おすすめ：");
    const author = ((await first.getAttribute("aria-label")) ?? "").replace(/さんの投稿$/, "");
    expect(["青木", "木下", "中村"].some((name) => author.includes(name)), author).toBe(true);
    // 焦点をページの地に移してから Escape
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("Escape");
    await expect(modal).toHaveCount(0);
  });

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

    // 理由のある投稿は今日の3人に先に入る。残っていれば、3人のあとに理由の一言付きで続く
    const total = Number((await count.getAttribute("aria-label"))!.match(/全 (\d+) 枚/)![1]);
    expect(total).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < total; i++) {
      if (i === 4 && total > 4) {
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
      // 0-2y：iPad の横では、みんなは3列の右の列の中。その日はじめてなら、列の中でも自動で開く
      const screen = await openScreen(page, "/minna");
      const modal = screen.getByRole("dialog", { name: "今日の3人" });
      await expect(modal).toBeInViewport({ ratio: 1 });
      expect((await modal.boundingBox())!.width).toBeLessThanOrEqual(26 * 16 + 1);
      expect(await screen.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
      await modal.getByRole("button", { name: "みんなを見る" }).click();
      await expect(modal).toHaveCount(0);
    });
  }
});
