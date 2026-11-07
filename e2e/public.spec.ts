import { type Browser, expect, type Page, test } from "@playwright/test";

// 0-3n：みんな用（合言葉なし・台本、KOEKATA_PUBLIC=1）では、訪問者ごとに書き込みを分ける。
// 2人の別の訪問者（別の context）が同じダミーの人物を選んでも、ほかの訪問者の書き込みは見えない。ダミーの初期データは両方に見える

const TODAY_SEEN = { name: "koekata_today_seen", value: "1", domain: "127.0.0.1", path: "/" };
// どの訪問者にも入っている、ダミーの初期データの投稿（src/lib/seed-data.ts の post-ask-1）
const SEED_POST = "しおり立ての底を広くしたら";
// 訪問者の cookie：32桁の乱数の ID と、起動ごとの秘密での署名
const SIGNED = /^[0-9a-f]{32}\.[0-9a-f]{32}$/;
const visitorCookie = async (page: Page) => (await page.context().cookies()).find((c) => c.name === "koekata_visitor")?.value;

/** 書き込みが出うる画面。サーバーで描いた中身に、ほかの訪問者の言葉が入っていないかを見る */
const SCREENS = [
  "/",
  "/minna",
  "/inbox",
  "/today",
  "/daily",
  "/me",
  "/me?open=thanks",
  "/me?open=partner",
  "/me?open=settings",
  "/teams",
  "/teams?channel=study",
  "/chie",
  "/tab",
  "/yousu",
  "/people/aoki",
  "/people/saeki",
];

async function visitor(browser: Browser, personId: string): Promise<Page> {
  const context = await browser.newContext({ storageState: test.info().project.use.storageState });
  await context.addCookies([TODAY_SEEN, { name: "koekata_person", value: personId, domain: "127.0.0.1", path: "/" }]);
  const page = await context.newPage();
  await page.goto("/");
  return page;
}

async function as(page: Page, personId: string) {
  await page.context().addCookies([{ name: "koekata_person", value: personId, domain: "127.0.0.1", path: "/" }]);
}

/** 全部の画面の HTML をつなげて返す */
async function allScreens(page: Page): Promise<string> {
  const pages: string[] = [];
  for (const path of SCREENS) {
    const response = await page.request.get(path);
    expect(response.status(), path).toBeLessThan(500);
    pages.push(await response.text());
  }
  return pages.join("\n");
}

test("ほかの訪問者の投稿・返事・ありがとう・日報・記憶は見えず、ダミーの初期データは両方に見える", async ({ browser }) => {
  const id = test.info().testId.slice(-8);
  const words = {
    post: `訪問者Aの投稿 ${id}`,
    ask: `訪問者Aから佐伯先生へのお願い ${id}`,
    reply: `訪問者Aの返事 ${id}`,
    thanks: `訪問者Aのありがとう ${id}`,
    daily: `訪問者Aの日報の言葉 ${id}`,
    memory: `訪問者Aの覚えて ${id}`,
  };

  // 訪問者A：青木さんとして投稿・お願い・ありがとう、佐伯先生として返事・日報・記憶
  const a = await visitor(browser, "aoki");
  const cookie = (await a.context().cookies()).find((c) => c.name === "koekata_visitor");
  expect(cookie?.value).toMatch(SIGNED);
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.secure).toBe(true);
  expect(cookie?.sameSite).toBe("Lax");
  expect((await a.request.post("/api/publish", { data: { text: words.post, channelId: "study" } })).ok()).toBe(true);
  expect((await a.request.post("/api/publish", { data: { text: words.ask, channelId: "study", askedPersonId: "saeki" } })).ok()).toBe(true);
  expect((await a.request.post("/api/thanks", { data: { toPersonId: "saeki", message: words.thanks } })).ok()).toBe(true);
  await as(a, "saeki");
  expect((await a.request.post("/api/today/reply", { data: { postId: "post-ask-1", text: words.reply } })).ok()).toBe(true);
  const daily = await a.request.post("/api/daily", { data: { action: "sync", conversation: [{ role: "user", content: words.daily }] } });
  expect(daily.ok()).toBe(true);
  expect(JSON.stringify(await daily.json())).toContain(words.daily);
  expect((await a.request.post("/api/memory", { data: { action: "remember", text: words.memory } })).ok()).toBe(true);

  // A 自身には、書いたものが見える
  const mine = await allScreens(a);
  // 失敗したときに HTML 全体を出さないよう、含むかどうかだけを比べる
  for (const text of [words.post, words.ask, words.reply, words.thanks, words.memory]) expect(mine.includes(text), text).toBe(true);
  expect(mine.includes(SEED_POST)).toBe(true);
  const again = await a.request.post("/api/daily", { data: { action: "sync", conversation: [] } });
  expect(JSON.stringify(await again.json())).toContain(words.daily);
  await a.goto("/minna");
  await expect(a.getByRole("article").filter({ hasText: words.post }).first()).toBeVisible();

  // 訪問者B：同じ人物（佐伯先生・青木さん）を選んでも、A の書き込みは一切見えない。初期データは見える
  const b = await visitor(browser, "saeki");
  const other = (await b.context().cookies()).find((c) => c.name === "koekata_visitor");
  expect(other?.value).toMatch(SIGNED);
  expect(other?.value).not.toBe(cookie?.value);
  for (const person of ["saeki", "aoki"]) {
    await as(b, person);
    const theirs = await allScreens(b);
    expect(theirs.includes(SEED_POST)).toBe(true);
    for (const text of Object.values(words)) expect(theirs.includes(text), `${person}：${text}`).toBe(false);
    const report = await b.request.post("/api/daily", { data: { action: "sync", conversation: [] } });
    expect(JSON.stringify(await report.json())).not.toContain(words.daily);
  }
  await as(b, "saeki");
  await b.goto("/minna");
  await expect(b.getByText(SEED_POST).first()).toBeVisible();
  await expect(b.getByText(words.post)).toHaveCount(0);
  await b.goto("/inbox");
  await expect(b.getByText(words.ask)).toHaveCount(0);

  // A が戻っても、自分の書き込みは残っている（B の訪問で消えない）
  await a.goto("/minna");
  await expect(a.getByRole("article").filter({ hasText: words.post }).first()).toBeVisible();
  await a.context().close();
  await b.context().close();
});

test("みんな用の訪問者の cookie は、出し直さず同じ ID を使い続ける", async ({ page }) => {
  await page.goto("/");
  const first = (await page.context().cookies()).find((c) => c.name === "koekata_visitor")?.value;
  expect(first).toMatch(SIGNED);
  await page.goto("/minna");
  expect((await page.context().cookies()).find((c) => c.name === "koekata_visitor")?.value).toBe(first);
});

test("合言葉なしで開ける道（死活の確かめ・ホーム画面の設定）では、訪問者の cookie を出さない", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  for (const path of ["/api/health", "/manifest.webmanifest"]) expect((await page.request.get(path)).ok()).toBe(true);
  expect(await visitorCookie(page)).toBeUndefined();
  await context.close();
});

test("署名のない・偽の署名の cookie では、ほかの訪問者の DB を使えず、新しい ID が出し直される", async ({ browser }) => {
  const words = `本物の訪問者の投稿 ${test.info().testId.slice(-8)}`;
  const real = await visitor(browser, "aoki");
  const value = (await visitorCookie(real))!;
  expect((await real.request.post("/api/publish", { data: { text: words, channelId: "study" } })).ok()).toBe(true);
  const [id, mac] = value.split(".");
  const flipped = `${mac.slice(0, -1)}${mac.endsWith("0") ? "1" : "0"}`;

  for (const forged of [id, `${id}.${flipped}`, `${id}.${"0".repeat(32)}`]) {
    const context = await browser.newContext({ storageState: test.info().project.use.storageState });
    await context.addCookies([TODAY_SEEN, { name: "koekata_visitor", value: forged, domain: "127.0.0.1", path: "/" }]);
    const page = await context.newPage();
    const html = await (await page.request.get("/teams?channel=study")).text();
    expect(html.includes(words), forged).toBe(false);
    expect((await (await page.request.get("/teams?channel=making")).text()).includes(SEED_POST)).toBe(true);
    const issued = await visitorCookie(page);
    expect(issued).toMatch(SIGNED);
    expect(issued?.startsWith(id)).toBe(false);
    await context.close();
  }
  // 本物の訪問者の書き込みは残っている
  expect((await (await real.request.get("/teams?channel=study")).text()).includes(words)).toBe(true);
  await real.context().close();
});

// 1分あたりの新しい訪問者の上限（このサーバーでは 12）を使い切るので、このファイルのいちばん最後に置く
test("新しい訪問者が1分あたりの上限を超えると、初期データだけを読める共有の DB になり、書き込みは誰にも残らない", async ({ browser }) => {
  const words = `上限を超えた訪問者の投稿 ${test.info().testId.slice(-8)}`;
  const kept: Page[] = [];
  let limited: Page | null = null;
  for (let i = 0; i < 20 && !limited; i++) {
    const page = await visitor(browser, "aoki");
    await page.request.post("/api/publish", { data: { text: `${words} ${i}`, channelId: "study" } });
    const html = await (await page.request.get("/teams?channel=study")).text();
    if (html.includes(`${words} ${i}`)) kept.push(page);
    else limited = page;
  }
  expect(limited, "上限で止まる").not.toBeNull();
  // 上限を超えた訪問者にも画面は出て、初期データが見える
  await limited!.goto("/minna");
  await expect(limited!.getByText(SEED_POST).first()).toBeVisible();
  // 前に作れた訪問者は、そのまま自分の DB を使える（消されない）
  const first = kept[0];
  expect((await (await first.request.get("/teams?channel=study")).text()).includes(`${words} 0`)).toBe(true);
  for (const page of [...kept, limited!]) await page.context().close();
});
