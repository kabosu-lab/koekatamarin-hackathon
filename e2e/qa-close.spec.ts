import { expect, type Frame, type Locator, type Page, test } from "@playwright/test";
import { openScreen, switchPerson } from "./helpers";

// 締め版の点検（11/7 夜）の直し：先生への口調、日報の「届きました」の札の位置、件名の「…」

test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: "koekata_today_seen", value: "1", domain: "127.0.0.1", path: "/" }]);
});

const VIEWPORTS = [
  { name: "iPhone", width: 390, height: 844 },
  { name: "iPad縦", width: 820, height: 1180 },
  { name: "iPad横", width: 1180, height: 820 },
];

const shot = (page: Page, name: string) => page.screenshot({ path: test.info().outputPath(`${name}.png`) });

async function say(page: Page, text: string) {
  const replies = page.locator("main.retro-home").getByRole("log").locator(".bubble.assistant:not(.waiting)");
  const before = await replies.count();
  await page.getByLabel("パートナーに書く").fill(text);
  await page.getByRole("button", { name: "パートナーへ送る" }).click();
  await expect(replies).toHaveCount(before + 1);
}

/** 文字が途中で切れていない（「…」がなく、縦にもはみ出していない） */
async function expectWhole(locator: Locator, text: string) {
  await expect(locator).toHaveText(text);
  const clipped = await locator.evaluate((element) => {
    const parent = element.closest("p, button, div") ?? element;
    return element.scrollHeight > element.clientHeight + 1 || parent.scrollHeight > parent.clientHeight + 1;
  });
  expect(clipped, "件名が縦に切れていない").toBe(false);
}

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.name} ${viewport.width}×${viewport.height}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
    });

    test("先生（佐伯）の履歴と設定は、です・ます（いま頑張っていること・頑張りたいことができたとき）", async ({ page }) => {
      const screen: Page | Frame = await openScreen(page, "/me");
      const now = screen.locator(".me-screen strong");
      await expect(now).toHaveText("話してくださったら、ここに残します");
      await shot(page, "4-履歴と設定");

      // 頑張りたいことを足すと上の窓が替わるので、ほかの先生で確かめる（佐伯の窓はほかのテストでも見る）
      await switchPerson(page, "川村 陽菜（理科・1年副担任・生徒指導）");
      const goals = await openScreen(page, "/me?open=goals");
      const panel = goals.getByRole("region", { name: "頑張りたいこと" });
      const goal = `毎朝5分歩く ${test.info().testId}`;
      await panel.getByLabel("頑張りたいことを足す").fill(goal);
      await panel.getByRole("button", { name: "足す" }).click();
      const item = panel.getByRole("listitem").filter({ hasText: goal });
      await item.getByRole("button", { name: "できた" }).click();
      await expect(panel.locator(".goal-done p")).toHaveText("できましたね！みんなにも伝えますか？");
      await shot(page, "4-頑張りたいことができた");
      await expect(goals.getByText(/やったね|残すよ/)).toHaveCount(0);
    });

    test("日報を届けた直後の「〇〇先生に届きました」は、本文に重ならず、列の中に見える", async ({ page }) => {
      // 日報は1人1日1つで、届けた項目の数で次に入る数が変わる。ほかの画面テストの日報を変えないよう、
      // 届ける通信だけは届いたことにして返す（本当に届くことは daily.spec.ts で確かめる）
      await page.route("**/api/daily", async (route) => {
        const body = route.request().postDataJSON() as { action?: string } | null;
        if (body?.action === "send") await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
        else await route.fallback();
      });
      await page.goto("/");
      await say(page, `図書室の本を並べ替えた ${test.info().testId}`);
      const screen = await openScreen(page, "/daily");
      await expect(screen.getByRole("checkbox").first()).toBeVisible();
      await expect(screen.getByText("新しい分を足しています…")).toHaveCount(0);
      const check = screen.locator('input[type="checkbox"]:not(:disabled)').first();
      await check.click();
      await expect(check).toBeChecked();
      await screen.getByRole("button", { name: "藤本先生に届ける（1件）" }).click();
      const done = screen.getByRole("status").filter({ hasText: "藤本先生に届きました" });
      await expect(done).toBeVisible();
      await expect(done).toBeInViewport({ ratio: 1 });
      await page.waitForTimeout(300);
      await shot(page, "7-日報_届けた直後");
      // 札と本文（見出し・項目・説明）が重ならない（1.4 秒で履歴と設定へ戻るので、一度に測る）
      const overlapped = await done.evaluate((element) => {
        const notice = element.getBoundingClientRect();
        return [...document.querySelectorAll('section.card[aria-label^="今日の"] :is(h3, label, p, li)')]
          .filter((other) => {
            const box = other.getBoundingClientRect();
            return box.height > 0 && notice.left < box.right && box.left < notice.right && notice.top < box.bottom && box.top < notice.bottom;
          })
          .map((other) => (other.textContent ?? "").slice(0, 20));
      });
      expect(overlapped, "札が本文に重なっていない").toEqual([]);
      // 届いたら、履歴と設定へ戻る
      await expect(screen.locator('[data-me="tiles"]')).toBeVisible({ timeout: 10_000 });
    });

    test("件名は2行までなら途中で「…」と切れず、シートでもみんなのカードでも全部読める", async ({ page }) => {
      const words = `今日の授業で、声を小さくしたら、教室が静かになりました。うれしかった ${test.info().testId}`;
      const subject = "今日の授業で、声を小さくしたら、教室が静かになりました";
      await page.goto("/");
      await say(page, words);
      await expect(page.getByRole("button", { name: "とどける" })).toBeEnabled();
      await page.getByRole("button", { name: "とどける" }).click();
      const title = page.locator(".preview .preview-subject-title strong");
      await expectWhole(title, subject);
      await expect(page.locator(".preview .preview-subject-tag")).toHaveText("【うまくいった】");
      await expect(page.locator(".perception")).toContainText("大丈夫そう");
      await shot(page, "8-シートの件名");
      await page.getByRole("button", { name: "本人として送る" }).click();
      await expect(page.locator(".sent").first()).toBeVisible();

      let minna: Page | Frame = page;
      await expect(async () => {
        minna = await openScreen(page, "/minna");
        await expect(minna.getByRole("article").filter({ hasText: words }).first()).toBeVisible({ timeout: 3000 });
      }).toPass();
      const card = minna.getByRole("article").filter({ hasText: words }).first();
      await card.scrollIntoViewIfNeeded();
      await expectWhole(card.locator(".post-subject strong"), `【うまくいった】${subject}`);
      await shot(page, "8-みんなのカードの件名");
    });
  });
}
