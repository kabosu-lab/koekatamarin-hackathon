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

test("見どころ：話す、問い返しで気づく、本人が確かめて送る、人から返事が届く（架空の例）", async ({ browser }) => {
  const id = test.info().testId;
  // 他のテストと同じ人物だと、知らせの既読が混ざる
  const page = await open(browser, "shiraishi");
  await page.goto("/");
  const input = page.getByLabel("パートナーに書く");
  const assistant = page.getByRole("log").locator(".bubble.assistant:not(.waiting)");
  const deliver = page.getByRole("button", { name: /とどける/ });

  await input.fill("今日の授業、急に静かになった瞬間があって");
  await input.press("Enter");
  await expect(assistant.last()).toContainText("その少し前、何してたん");
  // 文字数ではなく、パートナーが要素がそろったと判断したときだけ光る
  await expect(deliver).not.toHaveAttribute("data-ready", "true");

  await input.fill(`声を小さくしたんだ ${id}`);
  await input.press("Enter");
  await expect(assistant).toHaveCount(2);
  await expect(assistant.last()).toContainText("コツかもしれん");
  // 届けられそうなことを、色と文字で伝える。自動では送らない
  await expect(deliver).toHaveAttribute("data-ready", "true");
  await expect(deliver).toContainText("言葉になりそう");
  await expect(page.getByRole("button", { name: "本人として送る" })).toHaveCount(0);

  await deliver.click();
  const body = page.getByLabel("投稿の文章");
  await expect(body).toHaveValue(new RegExp(`声を小さくしたんだ ${id}`));
  await page.getByRole("button", { name: "本人として送る" }).click();
  await expect(page.getByRole("link", { name: "校内チャネルで見る" })).toBeVisible();
  await expect(page.getByRole("button", { name: /とどける/ })).toHaveAttribute("data-ready", "false");

  const colleague = await open(browser, "noda");
  await colleague.goto("/teams?channel=study");
  const post = colleague.getByRole("article").filter({ hasText: id });
  await post.getByLabel("返信").fill(`明日やってみます ${id}`);
  await post.getByRole("button", { name: "返信", exact: true }).click();
  await expect(post.locator(".reply")).toContainText("明日やってみます");

  // 窓の上の知らせは reply-notice.spec.ts で確かめる。ここでは、消えずに残る受信箱で届いたことを見る
  await page.goto("/inbox");
  const replies = page.getByRole("region", { name: "届いた返事" });
  await expect(replies).toContainText("野田 翔さん");
  await expect(replies).toContainText(`明日やってみます ${id}`);
});

test("動きを減らす設定では、とどけるを動かさず色だけで伝える", async ({ browser }) => {
  const page = await open(browser, "ogawara");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const input = page.getByLabel("パートナーに書く");
  // 台本では、何があったか（静かになった）とどうしたか（声を小さく）がそろうと光る
  await input.fill("今日の授業、急に静かになった瞬間があって");
  await input.press("Enter");
  await expect(page.getByRole("log").locator(".bubble.assistant:not(.waiting)")).toHaveCount(1);
  await input.fill("声を小さくしたら、みんな聞いてくれた");
  await input.press("Enter");
  const face = page.locator('.device-side[data-ready="true"] .device-side-face');
  await expect(face).toBeVisible();
  expect(await face.evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
});

test("少し話しただけなら、とどけるを目立たせない", async ({ browser }) => {
  const page = await open(browser, "fujimoto");
  await page.goto("/");
  const input = page.getByLabel("パートナーに書く");
  await input.fill("こんにちは");
  await input.press("Enter");
  await expect(page.getByRole("log").locator(".bubble.assistant:not(.waiting)")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /とどける/ })).toHaveAttribute("data-ready", "false");
});

for (const [teams, expected] of [
  [{ state: "sent" }, "Teams の"],
  [{ state: "pending" }, "Teams へは確認中"],
  [{ state: "failed" }, "Teams へは届いていません（つながりませんでした）"],
  [{ state: "skipped", reason: "signin" }, "この人はサインインしていません"],
  [{ state: "skipped", reason: "scope" }, "範囲を絞った投稿は Teams へ送りません"],
  [{ state: "skipped", reason: "kept" }, "校内だけに届きます"],
] as const) {
  test(`送った結果を正直に出す：${JSON.stringify(teams)}`, async ({ browser }) => {
    const page = await open(browser, "ogawara");
    await page.route("**/api/publish", async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, json: { ...(await response.json()), teams } });
    });
    await page.goto("/");
    const input = page.getByLabel("パートナーに書く");
    await input.fill(`結果の確かめ ${test.info().testId}`);
    await input.press("Enter");
    await page.getByRole("button", { name: /とどける/ }).click();
    await page.getByRole("button", { name: "本人として送る" }).click();
    const sent = page.locator(".sent");
    await expect(sent).toContainText(expected);
    if (teams.state !== "sent") await expect(sent).not.toContainText("届きました");
  });
}

test("Teams につないでいないときは、チャネルの見出しでダミーと分かる", async ({ browser }) => {
  const page = await open(browser, "ogawara");
  await page.goto("/teams?channel=study");
  await expect(page.getByText("Teams 風のダミー画面")).toBeVisible();
});
