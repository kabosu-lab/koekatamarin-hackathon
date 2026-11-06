import { expect, type Page, test } from "@playwright/test";
import { switchPerson } from "./helpers";

const SECRET = "親に殴られている 秘密の言葉";

async function say(page: Page, text: string) {
  await page.getByLabel("パートナーに書く").fill(text);
  await page.getByRole("button", { name: "パートナーへ送る" }).click();
  await expect(page.getByRole("log").locator(".bubble.assistant").last()).toBeVisible();
}

test("最初から、命や安全に関わるときは伝えることを本人に見せている", async ({ page }) => {
  await page.context().clearCookies({ name: /^koekata_promise_/ });
  await page.goto("/");
  await expect(page.locator(".promise")).toContainText("話した言葉ではなく要点だけを相談室の先生に伝えます");
});

test("心配な話は要点だけ相談室に届き、本人が選んだ先生にも伝えられる", async ({ page }) => {
  await page.goto("/");
  await switchPerson(page, "木下 蓮（3年・ものづくり部）");
  await say(page, SECRET);

  const card = page.getByRole("region", { name: "相談室に伝えました" });
  await expect(card).toContainText("要点だけ伝えました");
  await expect(card).toContainText("0120-0-78310");
  await expect(card).toContainText("見逃すことも");
  // 生徒どうしで知らせが届かないよう、選べるのは教職員だけ
  await expect(card.getByRole("checkbox", { name: /中村 結衣/ })).toHaveCount(0);

  await card.getByRole("checkbox", { name: /大河原 誠/ }).check();
  await card.getByRole("button", { name: "選んだ先生にも伝える" }).click();
  await expect(card).toContainText("大河原 誠先生にも伝えました");

  await switchPerson(page, "白石 文（養護・相談室）");
  await page.goto("/minna");
  await page.getByRole("link", { name: "相談室への知らせを見る" }).click();
  const alert = page.getByRole("article", { name: "木下 蓮さんについての知らせ" });
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("大河原 誠");
  await expect(page.getByText("秘密の言葉")).toHaveCount(0);

  await page.goto("/");
  await switchPerson(page, "川村 陽菜（理科・1年副担任・生徒指導）");
  await page.goto("/minna");
  await expect(page.getByRole("link", { name: "相談室への知らせを見る" })).toHaveCount(0);
  await switchTo2(page, "川村 陽菜（理科・1年副担任・生徒指導）");
  await expect(page.getByRole("article", { name: "木下 蓮さんについての知らせ" })).toHaveCount(0);
  await switchTo2(page, "大河原 誠（英語・学年主任）");
  await expect(page.getByRole("article", { name: "木下 蓮さんについての知らせ" })).toBeVisible();
});

/** 知らせの画面には切り替えがないので、最初の画面で切り替えて戻る。 */
async function switchTo2(page: Page, name: string) {
  await page.goto("/");
  await switchPerson(page, name);
  await page.goto("/soudan");
}

test("本人は「違うよ」と伝えられ、知らせは消えずに相談室に見える", async ({ page }) => {
  await page.goto("/");
  await switchPerson(page, "木下 蓮（3年・ものづくり部）");
  await say(page, "クラスのグループから外されて、教室に行くのがこわい");

  const card = page.getByRole("region", { name: "相談室に伝えました" });
  await expect(card).toContainText("外の機関に相談することもあります");
  await card.getByRole("button", { name: "違うよ" }).click();
  await expect(card).toContainText("知らせは取り消されません");
  await expect(card.getByRole("button", { name: "違うよ" })).toHaveCount(0);

  await page.goto("/");
  await switchPerson(page, "白石 文（養護・相談室）");
  await page.goto("/soudan");
  await expect(page.getByRole("article", { name: "木下 蓮さんについての知らせ" }).filter({ hasText: "本人から「違うよ」と届いています" }).first()).toBeVisible();
});

test("「違うよ」が届かなかったときは、もう一度押せる", async ({ page }) => {
  await page.route("**/api/converse", (route) =>
    route.fulfill({ json: { reply: "聞いてるよ", mode: "scripted", safety: { alertId: "x", counselingOpen: false, candidates: [] } } }),
  );
  await page.route("**/api/safety/dispute", (route) => route.fulfill({ status: 500, json: { error: "x" } }));
  await page.goto("/");
  await say(page, "……");

  const card = page.getByRole("region", { name: "相談室に伝えました" });
  await expect(card).toContainText("外の機関に相談することもあります");
  await card.getByRole("button", { name: "違うよ" }).click();
  await expect(card.getByRole("alert")).toContainText("もう一度押してください");
  await expect(card.getByRole("button", { name: "違うよ" })).toBeEnabled();
});

test("生徒には知らせの入口がなく、URL を開いても何も見えない", async ({ page }) => {
  await page.goto("/");
  await switchPerson(page, "青木 ひより（2年）");
  await page.goto("/me?open=settings");
  await expect(page.getByLabel("使う人")).toHaveValue("aoki");
  await page.goto("/minna");
  await expect(page.getByRole("link", { name: "相談室への知らせを見る" })).toHaveCount(0);

  await page.goto("/soudan");
  await expect(page.getByText("届いている知らせはありません")).toBeVisible();
});

test("ふつうの話では、案内は出ない", async ({ page }) => {
  await page.goto("/");
  await say(page, "今日は過去問を解いた");
  await expect(page.getByRole("region", { name: "相談室に伝えました" })).toHaveCount(0);
});

test("相談室が閉まっている時間は、そのことと今すぐ話せる窓口を伝える", async ({ page }) => {
  await page.route("**/api/converse", (route) =>
    route.fulfill({
      json: {
        reply: "聞いてるよ",
        mode: "scripted",
        safety: { alertId: "x", counselingOpen: false, candidates: [] },
      },
    }),
  );
  await page.goto("/");
  await say(page, "……");

  const card = page.getByRole("region", { name: "相談室に伝えました" });
  await expect(card).toContainText("いま相談室は閉まっています");
  await expect(card).toContainText("0120-279-338");
});

test("返事が作れなくても、相談室に伝えたことは本人に見せ、話した言葉も失わない", async ({ page }) => {
  await page.route("**/api/converse", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "x", safety: { alertId: "x", counselingOpen: true, candidates: [] } },
    }),
  );
  await page.goto("/");
  await page.getByLabel("パートナーに書く").fill("大事な話");
  await page.getByRole("button", { name: "パートナーへ送る" }).click();

  await expect(page.getByRole("region", { name: "相談室に伝えました" })).toBeVisible();
  await expect(page.getByLabel("パートナーに書く")).toHaveValue("大事な話");
});

test("最初の約束は、初めはカードで全文を見せ、わかったあとは話す画面に出さない", async ({ page }) => {
  // ほかのテストでは読んだことにしてあるので、ここだけ初めての人にする
  await page.context().clearCookies({ name: /^koekata_promise_/ });
  await page.goto("/");
  const promise = page.locator(".promise");
  await expect(promise).toContainText("話した言葉ではなく要点だけを相談室の先生に伝えます");
  // どの幅でも、カードの文と「わかった」がスクロールなしで全部見える
  await expect(promise).toBeInViewport({ ratio: 1 });
  await page.getByRole("button", { name: "わかった" }).click();
  await expect(promise).toHaveCount(0);
  await page.reload();
  await expect(promise).toHaveCount(0);
  await expect(page.getByRole("button", { name: "わかった" })).toHaveCount(0);

  await switchPerson(page, "青木 ひより（2年）");
  await expect(promise).toContainText("話した言葉ではなく要点だけを相談室の先生に伝えます");
});
