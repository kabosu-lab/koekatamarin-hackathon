import { expect, test } from "@playwright/test";

// 0-1l：話す画面の窓は LINE のような会話。左にアイコン付きのパートナー、右に自分。最新の言葉は頭から全部見える
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: "koekata_avatar", value: "hide", domain: "127.0.0.1", path: "/" }]);
});

for (const viewport of [
  { width: 390, height: 664 },
  { width: 820, height: 1180 },
  { width: 1180, height: 820 },
]) {
  test(`会話は左にパートナー・右に自分で、最新の言葉が全部見える（${viewport.width}×${viewport.height}）`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const input = page.getByLabel("パートナーに書く");
    const log = page.getByRole("log");
    const replies = log.locator(".bubble.assistant:not(.waiting)");
    const lines = ["今日の授業、急に静かになった瞬間があって", "こんにちは、ちょっと相談があるんだけど", "声を小さくしたら、みんな聞いてくれた"];
    for (const [index, line] of lines.entries()) {
      await input.fill(line);
      await input.press("Enter");
      await expect(replies).toHaveCount(index + 1);
      // 自分の言葉は右の吹き出しで、全部読める
      const mine = log.locator(".chat-row.me").last();
      await expect(mine).toContainText(line);
      await expect(mine.locator(".bubble")).toBeInViewport({ ratio: 1 });
      // パートナーの最新の返事も、頭から全部見える
      await expect(replies.last()).toBeInViewport({ ratio: 1 });
    }
    // 左右に分かれる
    const partnerBox = (await log.locator(".chat-row.partner .bubble").last().boundingBox())!;
    const meBox = (await log.locator(".chat-row.me .bubble").last().boundingBox())!;
    expect(partnerBox.x).toBeLessThan(meBox.x);
    // パートナーの行にはアイコンがある
    await expect(log.locator(".chat-row.partner .chat-icon:not(.chat-icon-space)").first()).toBeVisible();
    // 大きなパートナーは、会話のあいだは窓から下がる
    await expect(page.locator(".lcd-companion")).toBeHidden();
    // 広げて読むはもうない
    await expect(page.getByRole("button", { name: "広げて読む" })).toHaveCount(0);
  });
}

test("考え中は、アイコンの横の「…」の吹き出しになる", async ({ page }) => {
  await page.route("**/api/converse", async (route) => {
    await new Promise((done) => setTimeout(done, 800));
    await route.continue();
  });
  await page.goto("/");
  const input = page.getByLabel("パートナーに書く");
  await input.fill("こんにちは");
  await input.press("Enter");
  const waiting = page.getByRole("log").locator(".chat-row.partner .bubble.waiting");
  await expect(waiting).toBeVisible();
  await expect(waiting.locator(".thinking-dots i")).toHaveCount(3);
  await expect(waiting).toBeInViewport({ ratio: 1 });
  await expect(waiting).toHaveCount(0);
});

test("0-2l：とどけるを押すとすぐシートが開き、本文はカーソルの点滅とともに書かれ、書き終わるまで送れない", async ({ page }) => {
  await page.route("**/api/draft/stream", async (route) => {
    await new Promise((done) => setTimeout(done, 3600));
    await route.continue();
  });
  await page.goto("/");
  const input = page.getByLabel("パートナーに書く");
  const words = `今日の授業、急に静かになった瞬間があって ${test.info().testId}`;
  await input.fill(words);
  await input.press("Enter");
  await expect(page.getByRole("log").locator(".bubble.assistant:not(.waiting)")).toHaveCount(1);
  await page.getByRole("button", { name: /とどける/ }).click();
  // 待たずにシートが出て、見出しと Teams での見え方の枠（名前）が先に見える
  const sheet = page.getByRole("dialog", { name: "こんな言葉でどうかな？" });
  await expect(sheet).toBeVisible({ timeout: 1000 });
  await expect(sheet.locator(".preview-author")).toContainText("佐伯 みどり");
  await expect(sheet.locator(".compose-caret")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "本人として送る" })).toBeDisabled();
  // 会話の中の骨組みと「作っています」はもう出さない
  await expect(page.locator(".draft-skeleton")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /作っています/ })).toHaveCount(0);
  // 3秒を超えても書き始めないときは、何をしているかを一言
  await expect(sheet.locator(".compose-slow")).toContainText("下書きを作っています", { timeout: 5000 });
  // 書き終わると直せる欄になり、受け取られ方が届いたら送れる
  await expect(page.getByLabel("投稿の文章")).toHaveValue(words, { timeout: 15000 });
  await expect(sheet.locator(".compose-caret")).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: "本人として送る" })).toBeEnabled();
});

test("0-2l：本文は一度に出ず、少しずつ書かれていく", async ({ page }) => {
  await page.goto("/");
  const input = page.getByLabel("パートナーに書く");
  const words = `少しずつ書かれていく下書きを確かめるための、すこし長めの話です ${test.info().testId}`;
  await input.fill(words);
  await input.press("Enter");
  await expect(page.getByRole("log").locator(".bubble.assistant:not(.waiting)")).toHaveCount(1);
  await page.getByRole("button", { name: /とどける/ }).click();
  const writing = page.locator(".compose-writing");
  // 書いている途中の長さを、何度か見る。全部そろう前の途中の長さが見えれば、少しずつ書かれている
  const seen = new Set<number>();
  await expect
    .poll(async () => {
      const text = (await writing.textContent().catch(() => null)) ?? "";
      if (text.length > 0 && text.length < words.length) seen.add(text.length);
      return seen.size;
    }, { intervals: [20], timeout: 10_000 })
    .toBeGreaterThan(1);
  await expect(page.getByLabel("投稿の文章")).toHaveValue(words);
});

test("0-2l：本人として送るは押した瞬間にシートを閉じて飛ばし、送信に失敗したら下書きを残してやわらかく知らせる", async ({ page }) => {
  let release: () => void = () => {};
  const held = new Promise<void>((done) => (release = done));
  await page.route("**/api/publish", async (route) => {
    await held;
    await route.fulfill({ status: 503, json: { error: "x" } });
  });
  await page.goto("/");
  const input = page.getByLabel("パートナーに書く");
  const words = `失敗しても残る下書き ${test.info().testId}`;
  await input.fill(words);
  await input.press("Enter");
  await expect(page.getByRole("log").locator(".bubble.assistant:not(.waiting)")).toHaveCount(1);
  await page.getByRole("button", { name: /とどける/ }).click();
  await expect(page.getByLabel("投稿の文章")).toHaveValue(words);
  await page.getByRole("button", { name: "本人として送る" }).click();
  // 送信の結果を待たずに、シートが閉じて言葉が飛ぶ
  await expect(page.getByRole("dialog", { name: "こんな言葉でどうかな？" })).toBeHidden({ timeout: 1000 });
  await expect(page.locator(".send-burst")).toHaveCount(1, { timeout: 1000 });
  release();
  await expect(page.locator(".notice")).toContainText("下書きは残してあります");
  // とどけるで開き直すと、同じ言葉で、もう一度送れる
  await page.getByRole("button", { name: /とどける/ }).click();
  await expect(page.getByLabel("投稿の文章")).toHaveValue(words);
  await page.unroute("**/api/publish");
  await page.getByRole("button", { name: "本人として送る" }).click();
  await expect(page.getByRole("link", { name: "校内チャネルで見る" })).toBeVisible();
});

test("0-1l・0-2n：会話の中のアイコンを押すと「新しい話にしますか？」が出て、新しく話すと前の話は履歴に残り、大きなパートナーに戻る", async ({ page }) => {
  await page.goto("/");
  const input = page.getByLabel("パートナーに書く");
  const words = `前の話 ${test.info().testId}`;
  await input.fill(words);
  await input.press("Enter");
  await expect(page.getByRole("log").locator(".bubble.assistant:not(.waiting)")).toHaveCount(1);
  // 入口はアイコンの1つだけ。ほかに「新しく話す」のボタンは置かない
  await expect(page.getByRole("button", { name: "新しく話す" })).toHaveCount(0);
  const icon = page.getByRole("button", { name: "パートナー。押すと新しい話にできます" });
  await icon.click();
  // 佐伯（先生）には、です・ます
  const ask = page.getByRole("group", { name: "新しい話にしますか？" });
  await expect(ask).toBeVisible();
  await expect(icon).toHaveAttribute("aria-expanded", "true");
  // 外を押せば消える
  await page.getByRole("log").locator(".bubble.user").first().click();
  await expect(ask).toHaveCount(0);
  await icon.click();
  await ask.getByRole("button", { name: "新しく話す" }).click();
  await expect(page.getByRole("log").locator(".chat-row")).toHaveCount(0);
  await expect(page.locator(".talk.device")).toHaveAttribute("data-talking", "false");
  // 次に話すと、前の話は会話の上に残っていて読める
  await input.fill("次の話");
  await input.press("Enter");
  await expect(page.getByRole("region", { name: "前の話" })).toContainText(words);
});

test("0-2n：生徒には、くだけた「新しい話にする？」で聞く", async ({ page }) => {
  await page.context().addCookies([{ name: "koekata_person", value: "aoki", domain: "127.0.0.1", path: "/" }]);
  await page.goto("/");
  const input = page.getByLabel("パートナーに書く");
  await input.fill("ちょっと話したい");
  await input.press("Enter");
  await expect(page.getByRole("log").locator(".bubble.assistant:not(.waiting)")).toHaveCount(1);
  await page.getByRole("button", { name: "パートナー。押すと新しい話にできます" }).click();
  await expect(page.getByRole("group", { name: "新しい話にする？" })).toBeVisible();
});

test("0-2a：話す前は、パートナーを触るたびに一言が替わり、弾む", async ({ page }) => {
  // パートナーを見せる（ほかのテストでは隠している）
  await page.context().clearCookies({ name: "koekata_avatar" });
  await page.goto("/");
  const partner = page.getByRole("button", { name: "パートナー。触ると次の一言" });
  await expect(partner).toBeVisible();
  const bubble = page.locator(".lcd-companion");
  await page.waitForTimeout(1500);
  const first = await bubble.innerText();
  await partner.click();
  await expect.poll(async () => bubble.innerText(), { timeout: 5000 }).not.toBe(first);
});
