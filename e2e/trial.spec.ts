import { expect, type Page, test } from "@playwright/test";

// 合言葉つきの試用モード。playwright.config.ts の「試用」から、別のサーバーに向けて動く
const CODE = "test-code";
const NOTICE = "先生や相談室には届きません。投稿や相棒に覚えさせたことは、試している人に見えることがあります。実名や個人情報は入れないでください。本当に困ったことは先生へ。";

async function enter(page: Page) {
  await page.goto("/access");
  await page.getByLabel("合言葉").fill(CODE);
  await page.getByRole("button", { name: "入る" }).click();
  await expect(page.locator(".talk")).toBeVisible();
}

test("合言葉がなければ、ページも API も止まる", async ({ page, request }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/access$/);
  await expect(page.getByLabel("合言葉")).toBeVisible();
  await expect(page.getByText(NOTICE)).toBeVisible();

  for (const path of ["/soudan", "/teams", "/_next/static/none.js"]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(303);
  }
  expect((await request.get("/api/inbox")).status()).toBe(401);
  expect((await request.post("/api/converse", { data: { text: "こんにちは", history: [] } })).status()).toBe(401);
  expect((await request.get("/api/health")).status()).toBe(200);
});

test("違う合言葉では入れず、正しければ cookie で通る", async ({ page, context }) => {
  await page.goto("/access");
  await page.getByLabel("合言葉").fill("ちがう");
  await page.getByRole("button", { name: "入る" }).click();
  await expect(page.getByRole("alert")).toContainText("合言葉が違います");
  expect((await context.cookies()).some((c) => c.name === "koekata_access")).toBe(false);

  await enter(page);
  const cookie = (await context.cookies()).find((c) => c.name === "koekata_access");
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.secure).toBe(true);
  expect(cookie?.sameSite).toBe("Lax");
  expect(cookie?.value).not.toContain(CODE);
});

test("試用の表示はどの画面にも出て、相談室に届くとは書かない", async ({ page }) => {
  await enter(page);
  await expect(page.getByText(NOTICE)).toBeVisible();
  const promise = page.locator(".promise");
  await expect(promise).toContainText("相談室にも先生にも届きません");
  await expect(promise).not.toContainText("要点だけ");
  await page.goto("/soudan");
  await expect(page.getByText(NOTICE)).toBeVisible();
  await expect(page.locator("main")).toContainText("相談室に知らせは届きません");
  await page.goto("/teams");
  await expect(page.getByText(NOTICE)).toBeVisible();
});

test("命や安全に関わる話では、先生や相談室に届いていないことと窓口を伝える", async ({ page }) => {
  await enter(page);
  await page.getByRole("button", { name: "文字で書く" }).click();
  await page.getByLabel("相棒に書く").fill("親に殴られている");
  await page.getByRole("button", { name: "相棒に送る" }).click();

  const card = page.getByRole("region", { name: "大事なお知らせ" });
  await expect(card).toContainText("先生や相談室には届いていません");
  await expect(card).toContainText("直接話してください");
  await expect(card).toContainText("0120-0-78310");
  await expect(card).not.toContainText("要点だけ伝えました");
  await expect(card.getByRole("checkbox")).toHaveCount(0);
  await expect(card.getByRole("button")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "相談室に伝えました" })).toHaveCount(0);
});

test("外の URL から開いても、サーバーの処理と API を拒まない", async ({ page, request }) => {
  await enter(page);
  const actionRequest = page.waitForRequest((r) => r.method() === "POST" && Boolean(r.headers()["next-action"]));
  await page.getByLabel("使う人").selectOption({ label: "木下 蓮（3年・ものづくり部）" });
  await page.getByRole("button", { name: "切り替え" }).click();
  const original = await actionRequest;
  const headers = await original.allHeaders();
  const replay = (host: string, origin: string) =>
    request.post("/", {
      headers: { ...headers, host, origin },
      data: original.postDataBuffer() ?? undefined,
      maxRedirects: 0,
    });

  // 一時 URL のホストが、そのまま届く場合
  expect((await replay("abc.trycloudflare.com", "https://abc.trycloudflare.com")).status()).toBeLessThan(400);
  // ホストが書き換わって届いても、KOEKATA_ALLOWED_ORIGINS に合えば通る
  expect((await replay("127.0.0.1:3101", "https://abc.trycloudflare.com")).status()).toBeLessThan(400);
  // 許していない場所からは通さない
  expect((await replay("127.0.0.1:3101", "https://other.example.com")).status()).toBeGreaterThanOrEqual(400);

  const api = await page.request.post("/api/converse", {
    headers: { host: "abc.trycloudflare.com", origin: "https://abc.trycloudflare.com" },
    data: { text: "こんにちは", history: [] },
  });
  expect(api.status()).toBe(200);
});

test("外の URL から開いたときの入力画面への案内は、Mac の住所に飛ばさない", async ({ playwright }) => {
  const outside = await playwright.request.newContext({ baseURL: "http://127.0.0.1:3101" });
  const response = await outside.get("/", { headers: { host: "abc.trycloudflare.com" }, maxRedirects: 0 });
  expect(response.status()).toBe(303);
  expect(response.headers().location).not.toContain("127.0.0.1");
  expect(response.headers().location).toMatch(/\/access$/);
  await outside.dispose();
});

test("選べるのは生徒だけで、最初の人物も生徒になる", async ({ page }) => {
  await enter(page);
  await expect(page.locator('.talk[data-viewer="青木 ひより"]')).toBeVisible();
  const options = await page.getByLabel("使う人").locator("option").allTextContents();
  expect(options).toEqual(["青木 ひより（2年）", "木下 蓮（3年・ものづくり部）", "中村 結衣（1年・吹奏楽部）"]);
});

test("cookie を書き換えても、先生や相談室の人物として画面も API も使えない", async ({ page, context }) => {
  await enter(page);
  await context.addCookies([{ name: "koekata_person", value: "shiraishi", domain: "127.0.0.1", path: "/" }]);
  await page.goto("/");
  await expect(page.locator('.talk[data-viewer="青木 ひより"]')).toBeVisible();
  await expect(page.locator('.talk[data-viewer="白石 文"]')).toHaveCount(0);
  await expect(page.getByRole("link", { name: "相談室への知らせを見る" })).toHaveCount(0);

  // API から送っても、書き換えた先生ではなく生徒の投稿になる
  const words = `書き換えの確かめ ${test.info().testId}`;
  await page.getByRole("button", { name: "文字で書く" }).click();
  await page.getByLabel("相棒に書く").fill(words);
  await page.getByRole("button", { name: "相棒に送る" }).click();
  await expect(page.getByRole("log").locator(".bubble.assistant").last()).toBeVisible();
  await page.getByRole("button", { name: "言葉にして送る" }).click();
  await expect(page.getByLabel("投稿の文章")).toHaveValue(words);
  await page.getByRole("button", { name: "本人として送る" }).click();
  await page.getByRole("link", { name: "校内チャネルで見る" }).click();
  const post = page.getByRole("article").filter({ hasText: words });
  await expect(post).toContainText("青木 ひより");
  await expect(post).not.toContainText("白石 文");
});

test("サーバーの処理を直接呼んでも、先生には切り替えられない", async ({ page, context }) => {
  await enter(page);
  const actionRequest = page.waitForRequest((r) => r.method() === "POST" && Boolean(r.headers()["next-action"]));
  await page.getByLabel("使う人").selectOption({ label: "木下 蓮（3年・ものづくり部）" });
  await page.getByRole("button", { name: "切り替え" }).click();
  const original = await actionRequest;
  await expect(page.locator('.talk[data-viewer="木下 蓮"]')).toBeVisible();

  const headers = await original.allHeaders();
  const body = (original.postDataBuffer() ?? Buffer.alloc(0)).toString("latin1");
  expect(body).toContain("kinoshita");
  const switchTo = (id: string) =>
    page.request.post("/", {
      headers: { ...headers },
      data: Buffer.from(body.replace("kinoshita", id), "latin1"),
      maxRedirects: 0,
    });
  const currentPerson = async () => (await context.cookies()).find((c) => c.name === "koekata_person")?.value;

  // 同じ呼び方で、生徒には切り替わる（呼び方そのものが効いていることの確かめ）
  await switchTo("nakamura");
  expect(await currentPerson()).toBe("nakamura");
  await switchTo("shiraishi");
  expect(await currentPerson()).toBe("nakamura");
});

test("改善点は種類だけでも送れて、ありがとうと出て、続けて送れる", async ({ page }) => {
  await enter(page);
  await page.getByRole("button", { name: "改善点を送る" }).click();
  const sheet = page.getByRole("dialog", { name: "改善点を送る" });
  await expect(sheet).toContainText("名前は書かないでください。ここは相談先ではありません。困っていることは先生に直接話してください。");
  await expect(sheet.getByRole("button", { name: "送る", exact: true })).toBeDisabled();

  await sheet.getByRole("radio", { name: "よかった" }).check();
  await sheet.getByRole("button", { name: "送る", exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(page.locator(".feedback-thanks")).toHaveText("ありがとう");

  await page.getByRole("button", { name: "改善点を送る" }).click();
  await expect(sheet.getByRole("radio", { name: "よかった" })).not.toBeChecked();
  await sheet.getByRole("radio", { name: "動かない" }).check();
  await sheet.getByLabel("くわしく").fill("<script>alert(1)</script>");
  await sheet.getByRole("button", { name: "送る", exact: true }).click();
  await expect(sheet).toBeHidden();
});

test("改善点の書きかけは、画面を移っても消えない", async ({ page }) => {
  await enter(page);
  await page.getByRole("button", { name: "改善点を送る" }).click();
  const sheet = page.getByRole("dialog", { name: "改善点を送る" });
  await sheet.getByRole("radio", { name: "こうしたい" }).check();
  await sheet.getByLabel("くわしく").fill("書きかけの言葉");
  await sheet.getByRole("button", { name: "閉じる" }).click();

  await page.goto("/teams");
  await page.getByRole("button", { name: "改善点を送る" }).click();
  await expect(sheet.getByLabel("くわしく")).toHaveValue("書きかけの言葉");
  await expect(sheet.getByRole("radio", { name: "こうしたい" })).toBeChecked();
});

test("改善点は投稿にも他の画面にも出ず、入口は下のナビにかぶらない", async ({ page }) => {
  await enter(page);
  const secret = `改善の本文 ${test.info().testId}`;
  const response = await page.request.post("/api/feedback", { data: { kind: "こうしたい", body: secret, path: "/" } });
  expect(response.status()).toBe(200);
  for (const path of ["/", "/teams", "/minna", "/me", "/chie"]) {
    await page.goto(path);
    await expect(page.getByText(secret), path).toHaveCount(0);
  }
  const open = await page.getByRole("button", { name: "改善点を送る" }).boundingBox();
  const nav = await page.getByRole("navigation", { name: "画面の切り替え" }).boundingBox();
  expect(open && nav && open.y + open.height <= nav.y).toBe(true);
});

test("改善点は合言葉がないと送れず、同じ端末の連打を止める", async ({ page, playwright }) => {
  const outside = await playwright.request.newContext({ baseURL: "http://127.0.0.1:3101" });
  expect((await outside.post("/api/feedback", { data: { kind: "よかった" } })).status()).toBe(401);
  await outside.dispose();

  await enter(page);
  // ほかのテストの回数と混ざらないよう、このテストだけの端末の印を付ける
  await page.context().addCookies([{ name: "koekata_feedback_device", value: test.info().testId, domain: "127.0.0.1", path: "/" }]);
  const statuses: number[] = [];
  for (let i = 0; i < 11; i += 1) {
    statuses.push((await page.request.post("/api/feedback", { data: { kind: "よかった", path: "/" } })).status());
  }
  expect(statuses.slice(0, 10).every((status) => status === 200)).toBe(true);
  expect(statuses[10]).toBe(429);
  expect((await page.request.post("/api/feedback", { data: { kind: "違う" } })).status()).toBe(429);
});

test.describe("見た目を選んでいない生徒", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("レトロでも、試用の表示と改善点の入口がある", async ({ page }) => {
    await page.goto("/access");
    await page.getByLabel("合言葉").fill(CODE);
    await page.getByRole("button", { name: "入る" }).click();
    await expect(page.locator(".retro-home")).toBeVisible();
    await expect(page.getByText(NOTICE)).toBeVisible();
    await expect(page.getByRole("button", { name: "改善点を送る" })).toBeVisible();
    await page.getByRole("link", { name: "はなす" }).click();
    await expect(page.locator(".promise")).toContainText("相談室にも先生にも届きません");
    await expect(page.getByRole("button", { name: "改善点を送る" })).toBeVisible();
  });
});
