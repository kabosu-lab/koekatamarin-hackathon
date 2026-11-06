import { expect, type Page, test } from "@playwright/test";
import { switchPerson } from "./helpers";

async function say(page: Page, text: string) {
  await page.getByLabel("パートナーに書く").fill(text);
  await page.getByRole("button", { name: "パートナーへ送る" }).click();
  await expect(page.getByRole("log").locator(".bubble.assistant").last()).toBeVisible();
}

test("話したことが日報の項目になり、チェックして「届ける」を押した項目だけが管理職に届き、一言が返る", async ({ page }) => {
  const shared = `作文を褒めた ${test.info().testId}`;
  await page.goto("/");
  await switchPerson(page, "川村 陽菜（理科・1年副担任・生徒指導）");
  await say(page, shared);

  // 日報は「履歴と設定」の「日報」のタイルの中。開くだけで自動でまとまる
  await page.goto("/me?open=daily");

  const item = page.getByRole("checkbox", { name: shared });
  await expect(item).not.toBeChecked();

  await page.goto("/");
  await switchPerson(page, "藤本 恵（教頭）");
  await page.goto("/inbox");
  await expect(page.getByText(shared)).toHaveCount(0);

  await page.goto("/");
  await switchPerson(page, "川村 陽菜（理科・1年副担任・生徒指導）");
  await page.goto("/daily");
  await expect(page.getByText("チェックを付けた項目を、藤本先生に届けます。付けなければ自分だけの日報です。")).toBeVisible();
  await expect(page.getByRole("button", { name: "自分だけに残す" })).toBeVisible();
  await page.getByRole("checkbox", { name: shared }).click();
  await expect(page.getByRole("checkbox", { name: shared })).toBeChecked();
  await page.getByRole("button", { name: "藤本先生に届ける（1件）" }).click();
  await expect(page.getByRole("status").filter({ hasText: "藤本先生に届きました" })).toBeVisible();
  // 届いたら、元の画面（履歴と設定）へ戻る
  await expect(page).toHaveURL(/\/me$/);

  await page.goto("/");
  await switchPerson(page, "藤本 恵（教頭）");
  await page.goto("/inbox");
  const report = page.getByRole("article", { name: "川村 陽菜さんから" });
  await expect(report).toContainText(shared);
  await report.getByLabel("一言かえす").fill("よく見ていますね");
  await report.getByRole("button", { name: "一言を送る" }).click();
  await expect(report.locator(".response-card")).toContainText("よく見ていますね");

  await page.goto("/");
  await switchPerson(page, "川村 陽菜（理科・1年副担任・生徒指導）");
  await page.goto("/daily");
  await expect(page.getByRole("region", { name: "届いた一言" })).toContainText("藤本 恵先生");
});

test("生徒の日記は担任にだけ届く", async ({ page }) => {
  const words = `朝練を頑張った ${test.info().testId}`;
  await page.goto("/");
  await switchPerson(page, "中村 結衣（1年・吹奏楽部）");
  await say(page, words);
  await page.goto("/daily");
  await expect(page.getByRole("heading", { name: "今日の日記" })).toBeVisible();
  await page.getByRole("checkbox", { name: words }).click();
  await expect(page.getByRole("checkbox", { name: words })).toBeChecked();
  await page.getByRole("button", { name: /^.+先生に届ける（1件）$/ }).click();
  await expect(page).toHaveURL(/\/me$/);

  await page.goto("/");
  await switchPerson(page, "藤本 恵（教頭）");
  await page.goto("/inbox");
  await expect(page.getByText(words)).toHaveCount(0);

  await page.goto("/");
  await switchPerson(page, "川村 陽菜（理科・1年副担任・生徒指導）");
  await page.goto("/inbox");
  await expect(page.getByRole("article", { name: "中村 結衣さんから" })).toContainText(words);
});

test("画面を行き来してもパートナーとの話は消えない", async ({ page }) => {
  const words = `続きの話 ${test.info().testId}`;
  await page.goto("/");
  await say(page, words);
  const nav = page.getByRole("navigation", { name: "画面の切り替え" });
  await nav.getByRole("link", { name: "みんな" }).click();
  await expect(page.getByRole("heading", { name: "みんな" })).toBeVisible();
  await nav.getByRole("link", { name: "話す" }).click();
  await expect(page.getByRole("log").locator(".bubble.user")).toContainText(words);
});

test("材料がないときは作らず、そのことを伝える。作るボタンも係のボタンもない", async ({ page }) => {
  await page.goto("/");
  await switchPerson(page, "白石 文（養護・相談室）");
  await page.goto("/daily");
  await expect(page.getByText("今日はまだまとめるものがありません。話したり、届けたりすると、ここにたまります。")).toBeVisible();
  await expect(page.getByRole("button", { name: /作る|作り直す|係に頼む/ })).toHaveCount(0);
});

test("開くだけでまとまり、増えていなければ二度目は呼ばない。言葉を直すと残る", async ({ page }) => {
  const words = `廊下で声をかけた ${test.info().testId}`;
  await page.goto("/");
  await switchPerson(page, "大河原 誠（英語・学年主任）");
  await say(page, words);

  const syncs: boolean[] = [];
  page.on("response", async (response) => {
    if (!response.url().endsWith("/api/daily") || response.request().method() !== "POST") return;
    const body = response.request().postDataJSON() as { action?: string };
    if (body.action !== "sync") return;
    const data = (await response.json().catch(() => ({}))) as { called?: boolean };
    syncs.push(Boolean(data.called));
  });

  await page.goto("/daily");
  await expect(page.getByRole("checkbox", { name: words })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("checkbox", { name: words })).toBeVisible();
  await expect.poll(() => syncs).toEqual([true, false]);

  await page.getByRole("button", { name: "言葉を直す" }).click();
  const fixed = `声をかけたら笑ってくれた ${test.info().testId}`;
  await page.getByRole("textbox", { name: /項目を直す/ }).last().fill(fixed);
  await page.getByRole("button", { name: "直し終わる" }).click();
  await expect(page.getByRole("checkbox", { name: fixed })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("checkbox", { name: fixed })).toBeVisible();
});

test("0-2u：チェックだけでは届かず、届けるのに失敗したら知らせて、選んだものを残す", async ({ page }) => {
  const words = `チェックの確認 ${test.info().testId}`;
  await page.goto("/");
  await switchPerson(page, "野田 翔（情報・ものづくり部顧問）");
  await say(page, words);
  await page.goto("/daily");
  const box = page.getByRole("checkbox", { name: words });
  await expect(box).not.toBeChecked();

  // チェックを付けても、サーバーには何も送らない
  const sends: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/daily") && request.method() === "POST") sends.push(String((request.postDataJSON() as { action?: string }).action));
  });
  await box.click();
  await expect(box).toBeChecked();
  const button = page.getByRole("button", { name: "藤本先生に届ける（1件）" });
  await expect(button).toBeVisible();
  await expect(button).toBeInViewport();
  expect(sends).toEqual([]);

  await page.route("**/api/daily", (route) => route.fulfill({ status: 503, json: { error: "x" } }));
  await button.click();
  await expect(page.locator(".notice")).toContainText("藤本先生に届けられませんでした");
  await expect(box).toBeChecked();
  await expect(box).toBeEnabled();
  await expect(button).toBeEnabled();
  await expect(page).toHaveURL(/\/daily$/);
});

test("0-2u：届けたあとに増えた項目は、次に押したときに増えた分だけ届く", async ({ page }) => {
  const first = `一つ目の話 ${test.info().testId}`;
  const second = `二つ目の話 ${test.info().testId}`;
  await page.goto("/");
  await switchPerson(page, "中村 結衣（1年・吹奏楽部）");
  await say(page, first);
  await page.goto("/daily");
  await page.getByRole("checkbox", { name: first }).click();
  await page.getByRole("button", { name: "川村先生に届ける（1件）" }).click();
  await expect(page).toHaveURL(/\/me$/);

  await page.goto("/");
  await say(page, second);
  await page.goto("/daily");
  // 届いた項目は届いた印のまま、変えられない
  await expect(page.getByRole("checkbox", { name: first })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: first })).toBeDisabled();
  await expect(page.getByRole("button", { name: "自分だけに残す" })).toBeVisible();
  await page.getByRole("checkbox", { name: second }).click();
  const sent = page.waitForRequest((request) => request.url().endsWith("/api/daily") && (request.postDataJSON() as { action?: string }).action === "send");
  await page.getByRole("button", { name: "川村先生に届ける（1件）" }).click();
  expect(((await sent).postDataJSON() as { itemIds: string[] }).itemIds).toHaveLength(1);
  await expect(page).toHaveURL(/\/me$/);

  await page.goto("/");
  await switchPerson(page, "川村 陽菜（理科・1年副担任・生徒指導）");
  await page.goto("/inbox");
  const report = page.getByRole("article", { name: "中村 結衣さんから" });
  await expect(report).toContainText(first);
  await expect(report).toContainText(second);
});

test("0-2u：何も選ばずに押すと「残しました」と出して、履歴と設定へ戻る", async ({ page }) => {
  await page.goto("/");
  await switchPerson(page, "大河原 誠（英語・学年主任）");
  await say(page, `残すだけの話 ${test.info().testId}`);
  await page.goto("/daily");
  await expect(page.getByRole("checkbox").first()).toBeVisible();
  await page.getByRole("button", { name: "自分だけに残す" }).click();
  await expect(page.getByRole("status").filter({ hasText: "残しました" })).toBeVisible();
  await expect(page).toHaveURL(/\/me$/);
});

test("チェックと文章は同じ行に並ぶ", async ({ page }) => {
  await page.goto("/");
  await switchPerson(page, "大河原 誠（英語・学年主任）");
  await say(page, `並びの確認 ${test.info().testId}`);
  await page.goto("/daily");
  const label = page.locator("label.daily-item").first();
  await expect(label).toBeVisible();
  const box = await label.locator("input").boundingBox();
  const text = await label.locator("span").boundingBox();
  expect(box && text && box.x + box.width <= text.x).toBe(true);
  expect(box && text && box.y < text.y + text.height).toBe(true);
});

test("届けたやり取りも開くだけでまとまり、係に頼むボタンはなく、チェックは付いていない", async ({ page }) => {
  const words = `朝練の話 ${test.info().testId}`;
  await page.goto("/");
  await switchPerson(page, "木下 蓮（3年・ものづくり部）");
  await say(page, words);
  await page.getByRole("button", { name: "とどける" }).click();
  await page.getByRole("button", { name: "本人として送る" }).click();
  await expect(page.locator(".sent")).toBeVisible();

  await page.goto("/daily");
  await expect(page.getByRole("button", { name: "夕方のまとめを係に頼む" })).toHaveCount(0);
  const boxes = page.getByRole("checkbox");
  await expect(boxes.first()).toBeVisible();
  await expect(page.getByRole("checkbox", { checked: true })).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
});
