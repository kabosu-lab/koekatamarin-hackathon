import { expect, type Page, test } from "@playwright/test";

const SECRET = "親に殴られている 秘密の言葉";

async function switchTo(page: Page, name: string) {
  await page.getByLabel("使う人").selectOption({ label: name });
  await page.getByRole("button", { name: "切り替え" }).click();
}

async function say(page: Page, text: string) {
  await page.getByRole("button", { name: "文字で書く" }).click();
  await page.getByLabel("相棒に書く").fill(text);
  await page.getByRole("button", { name: "相棒に送る" }).click();
  await expect(page.getByRole("log").locator(".bubble.assistant").last()).toBeVisible();
}

test("最初から、命や安全に関わるときは伝えることを本人に見せている", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".promise")).toContainText("命や安全に関わるときは相談室の先生に伝えます");
});

test("心配な話は要点だけ相談室に届き、本人が選んだ先生にも伝えられる", async ({ page }) => {
  await page.goto("/");
  await switchTo(page, "木下 蓮（3年・ものづくり部）");
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

  await switchTo(page, "白石 文（養護・相談室）");
  await page.getByRole("link", { name: "相談室への知らせを見る" }).click();
  const alert = page.getByRole("article", { name: "木下 蓮さんについての知らせ" });
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("大河原 誠");
  await expect(page.getByText("秘密の言葉")).toHaveCount(0);

  await switchTo2(page, "川村 陽菜（理科・1年副担任）");
  await expect(page.getByRole("article", { name: "木下 蓮さんについての知らせ" })).toHaveCount(0);
  await switchTo2(page, "大河原 誠（英語・学年主任）");
  await expect(page.getByRole("article", { name: "木下 蓮さんについての知らせ" })).toBeVisible();
});

/** 知らせの画面には切り替えがないので、最初の画面で切り替えて戻る。 */
async function switchTo2(page: Page, name: string) {
  await page.goto("/");
  await switchTo(page, name);
  await expect(page.getByRole("link", { name: "相談室への知らせを見る" })).toBeVisible();
  await page.goto("/soudan");
}

test("生徒には知らせの入口がなく、URL を開いても何も見えない", async ({ page }) => {
  await page.goto("/");
  await switchTo(page, "青木 ひより（2年）");
  await expect(page.getByLabel("使う人")).toHaveValue("aoki");
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
