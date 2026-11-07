import { type Browser, expect, type Page, test } from "@playwright/test";

// 0-3n：みんな用（合言葉なし・台本、KOEKATA_PUBLIC=1）では、訪問者ごとに書き込みを分ける。
// 2人の別の訪問者（別の context）が同じダミーの人物を選んでも、ほかの訪問者の書き込みは見えない。ダミーの初期データは両方に見える

const TODAY_SEEN = { name: "koekata_today_seen", value: "1", domain: "127.0.0.1", path: "/" };
// どの訪問者にも入っている、ダミーの初期データの投稿（src/lib/seed-data.ts の post-ask-1）
const SEED_POST = "しおり立ての底を広くしたら";

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
  expect(cookie?.value).toMatch(/^[0-9a-f]{32}$/);
  expect(cookie?.httpOnly).toBe(true);
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
  expect(other?.value).toMatch(/^[0-9a-f]{32}$/);
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
  expect(first).toMatch(/^[0-9a-f]{32}$/);
  await page.goto("/minna");
  expect((await page.context().cookies()).find((c) => c.name === "koekata_visitor")?.value).toBe(first);
});
