import { expect, type Browser, test } from "@playwright/test";
import { PROMISE_SEEN } from "./promise-seen";

test.use({ storageState: { cookies: PROMISE_SEEN, origins: [] } });

async function open(browser: Browser, personId: string) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies([
    { name: "koekata_person", value: personId, domain: "127.0.0.1", path: "/" },
    { name: "koekata_avatar", value: "hide", domain: "127.0.0.1", path: "/" },
  ]);
  return context.newPage();
}

test("告知を話すと足りないことだけ聞かれ、本人が確かめて送り、「行きます」を集める", async ({ browser }) => {
  const id = test.info().testId;
  const page = await open(browser, "noda");
  await page.goto("/");
  const input = page.getByLabel("パートナーに書く");
  const assistant = page.getByRole("log").locator(".bubble.assistant:not(.waiting)");

  await input.fill(`放課後に勉強会を開きたい ${id}`);
  await input.press("Enter");
  await expect(assistant.last()).toContainText("いつやるん");
  await input.fill("金曜の16時から");
  await input.press("Enter");
  await expect(assistant.last()).toContainText("どこでやるん");
  await input.fill("情報室で");
  await input.press("Enter");
  await expect(assistant.last()).toContainText("そろったね");

  await page.getByRole("button", { name: /とどける/ }).click();
  await expect(page.getByLabel("投稿の文章")).toHaveValue(new RegExp(id));
  await page.getByRole("button", { name: "本人として送る" }).click();
  await expect(page.locator(".sent")).toBeVisible();

  const other = await open(browser, "kinoshita");
  await other.goto("/teams?channel=study");
  const seen = other.getByRole("article").filter({ hasText: id });
  await expect(seen).toContainText("0 人");
  await seen.getByRole("button", { name: "行きます" }).click();
  await expect(seen.getByRole("button", { name: /押し済み/ })).toBeVisible();
  await expect(seen).toContainText("1 人");
  // 誰が行くかは投稿した本人にだけ見える
  await expect(seen).not.toContainText("木下 蓮）");

  await page.goto("/teams?channel=study");
  const mine = page.getByRole("article").filter({ hasText: id });
  await expect(mine).toContainText("行きます 1 人（木下 蓮）");
});

test("告知でない投稿には「行きます」が出ない", async ({ browser }) => {
  const id = test.info().testId;
  const page = await open(browser, "noda");
  await page.goto("/");
  await page.request.post("/api/publish", { data: { text: `ふつうの投稿 ${id}`, channelId: "study" } });
  const other = await open(browser, "kinoshita");
  await other.goto("/teams?channel=study");
  const seen = other.getByRole("article").filter({ hasText: id });
  await expect(seen).toBeVisible();
  await expect(seen.getByRole("button", { name: "行きます" })).toHaveCount(0);
});
