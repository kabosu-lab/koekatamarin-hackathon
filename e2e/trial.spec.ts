import { expect, type Page, test } from "@playwright/test";

// 合言葉つきの試用モード。playwright.config.ts の「試用」から、別のサーバーに向けて動く
const CODE = "test-code";
// この試用は Teams へ送る人を決めていないので、Teams のことは書かない
const NOTICE = "試用版です。名前や個人の情報は書かないでね。書いたことは、試している人どうしで見えます。相談室には届かないので、本当に困ったことは先生や近くの大人へ。";

async function enter(page: Page) {
  await page.goto("/access");
  await page.getByLabel("合言葉").fill(CODE);
  await page.getByRole("button", { name: "入る" }).click();
  await expect(page.locator(".talk")).toBeVisible();
  // 最初の1回だけ出る注意のカードを閉じる
  await page.getByRole("dialog", { name: "試用版について" }).getByRole("button", { name: "わかった" }).click();
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

test("試用の注意は最初に1回だけカードで全部見せ、あとはすみの印から読み直せる", async ({ page }) => {
  await page.goto("/access");
  await page.getByLabel("合言葉").fill(CODE);
  await page.getByRole("button", { name: "入る" }).click();
  const card = page.getByRole("dialog", { name: "試用版について" });
  await expect(card).toContainText(NOTICE);
  // 注意の文のあとに、感想の誘いと、右上のアイコンと同じ絵（0-2h (4b)）
  await expect(card).toContainText("気づいたことを、ぜひ教えてね。右上の");
  await expect(card.getByRole("img", { name: "感想のアイコン" }).locator("svg")).toBeVisible();
  // スクロールなしで、文と「わかった」が全部見える
  await expect(card).toBeInViewport({ ratio: 1 });
  // 相談室に要点を伝えるという、本番の約束は出さない（試用では届かない）
  await expect(page.getByText("要点だけ")).toHaveCount(0);
  await card.getByRole("button", { name: "わかった" }).click();
  await expect(card).toHaveCount(0);
  // 上の帯はやめた。注意の文はもう画面に出ない
  await expect(page.getByText(NOTICE)).toHaveCount(0);

  await page.reload();
  await expect(card).toHaveCount(0);
  // 消したあとは、試用の印を出さない（製品版と同じ画面）。感想の入口だけが右上に小さく浮かぶ（0-2h）
  for (const path of ["/", "/teams", "/minna"]) {
    await page.goto(path);
    await expect(page.getByRole("button", { name: "感想を送る" }), path).toHaveCount(1);
    await expect(page.getByText("試用版"), path).toHaveCount(0);
  }
  await page.goto("/soudan");
  await expect(page.locator("main")).toContainText("相談室に知らせは届きません");
  // 読み直しは「履歴と設定」から。感想の入口はタイルに置かない（同じ入口を2か所に置かない）
  await page.goto("/me?open=trial");
  const tools = page.getByRole("region", { name: "試用版について" });
  await expect(tools.getByRole("button", { name: "感想を送る" })).toHaveCount(0);
  await tools.getByRole("button", { name: "注意を読み直す" }).click();
  await expect(card).toContainText(NOTICE);
  await expect(card).toContainText("気づいたことを、ぜひ教えてね。");
});

test("命や安全に関わる話では、先生や相談室に届いていないことと窓口を伝える", async ({ page }) => {
  await enter(page);
  await page.getByLabel("パートナーに書く").fill("親に殴られている");
  await page.getByRole("button", { name: "パートナーへ送る" }).click();

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
  await page.goto("/me?open=settings");
  const actionRequest = page.waitForRequest((r) => r.method() === "POST" && Boolean(r.headers()["next-action"]));
  await page.getByLabel("試す人を切り替える").selectOption({ label: "木下 蓮（3年・ものづくり部）" });
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
  expect((await replay(`127.0.0.1:${Number(process.env.KOEKATA_E2E_PORT ?? 3100) + 1}`, "https://abc.trycloudflare.com")).status()).toBeLessThan(400);
  // 許していない場所からは通さない
  expect((await replay(`127.0.0.1:${Number(process.env.KOEKATA_E2E_PORT ?? 3100) + 1}`, "https://other.example.com")).status()).toBeGreaterThanOrEqual(400);

  const api = await page.request.post("/api/converse", {
    headers: { host: "abc.trycloudflare.com", origin: "https://abc.trycloudflare.com" },
    data: { text: "こんにちは", history: [] },
  });
  expect(api.status()).toBe(200);
});

test("外の URL から開いたときの入力画面への案内は、Mac の住所に飛ばさない", async ({ playwright }) => {
  const outside = await playwright.request.newContext({ baseURL: `http://127.0.0.1:${Number(process.env.KOEKATA_E2E_PORT ?? 3100) + 1}` });
  const response = await outside.get("/", { headers: { host: "abc.trycloudflare.com" }, maxRedirects: 0 });
  expect(response.status()).toBe(303);
  expect(response.headers().location).not.toContain("127.0.0.1");
  expect(response.headers().location).toMatch(/\/access$/);
  await outside.dispose();
});

test("選べるのは生徒だけで、最初の人物も生徒になる", async ({ page }) => {
  await enter(page);
  await expect(page.locator('.talk[data-viewer="青木 ひより"]')).toBeVisible();
  await page.goto("/me?open=settings");
  await page.goto("/me?open=settings");
  const options = await page.getByLabel("試す人を切り替える").locator("option").allTextContents();
  expect(options).toEqual(["青木 ひより（2年）", "木下 蓮（3年・ものづくり部）", "中村 結衣（1年・吹奏楽部）"]);
});

test("cookie を書き換えても、先生や相談室の人物として画面も API も使えない", async ({ page, context }) => {
  await enter(page);
  await context.addCookies([{ name: "koekata_person", value: "shiraishi", domain: "127.0.0.1", path: "/" }]);
  await page.goto("/");
  await expect(page.locator('.talk[data-viewer="青木 ひより"]')).toBeVisible();
  await expect(page.locator('.talk[data-viewer="白石 文"]')).toHaveCount(0);
  await page.goto("/minna");
  await expect(page.getByRole("link", { name: "相談室への知らせを見る" })).toHaveCount(0);
  await page.goto("/");

  // API から送っても、書き換えた先生ではなく生徒の投稿になる
  const words = `書き換えの確かめ ${test.info().testId}`;
  await page.getByLabel("パートナーに書く").fill(words);
  await page.getByRole("button", { name: "パートナーへ送る" }).click();
  await expect(page.getByRole("log").locator(".bubble.assistant").last()).toBeVisible();
  await page.getByRole("button", { name: "とどける" }).click();
  await expect(page.getByLabel("投稿の文章")).toHaveValue(words);
  await page.getByRole("button", { name: "本人として送る" }).click();
  await page.getByRole("link", { name: "校内チャネルで見る" }).click();
  const post = page.getByRole("article").filter({ hasText: words });
  await expect(post).toContainText("青木 ひより");
  await expect(post).not.toContainText("白石 文");
});

test("サーバーの処理を直接呼んでも、先生には切り替えられない", async ({ page, context }) => {
  await enter(page);
  await page.goto("/me?open=settings");
  const actionRequest = page.waitForRequest((r) => r.method() === "POST" && Boolean(r.headers()["next-action"]));
  await page.getByLabel("試す人を切り替える").selectOption({ label: "木下 蓮（3年・ものづくり部）" });
  await page.getByRole("button", { name: "切り替え" }).click();
  const original = await actionRequest;
  await expect(async () => {
    await page.goto("/");
    await expect(page.locator('.talk[data-viewer="木下 蓮"]')).toBeVisible({ timeout: 2000 });
  }).toPass();

  const headers = await original.allHeaders();
  const body = (original.postDataBuffer() ?? Buffer.alloc(0)).toString("latin1");
  expect(body).toContain("kinoshita");
  const switchTo = (id: string) =>
    // 切り替えは「履歴と設定」の「設定」のタイルにだけあるので、その画面へ同じ呼び方を送る
    page.request.post("/me?open=settings", {
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

test("生徒の試用では、話した言葉をパートナーに覚えさせられない", async ({ page, request }) => {
  await enter(page);
  await page.getByLabel("パートナーに書く").fill("部活で新しい練習を考えた");
  await page.getByRole("button", { name: "パートナーへ送る" }).click();
  await expect(page.locator(".bubble.assistant").last()).toBeVisible();
  await expect(page.getByRole("button", { name: "これを覚えて" })).toHaveCount(0);
  const response = await page.request.post("/api/memory", { data: { action: "remember", text: "覚えて" } });
  expect(response.status()).toBe(403);
  void request;
});

test("改善点は種類だけでも送れて、ありがとうと出て、続けて送れる", async ({ page }) => {
  await enter(page);
  await page.getByRole("button", { name: "感想を送る" }).click();
  const sheet = page.getByRole("dialog", { name: "感想を送る" });
  await expect(sheet).toContainText("名前は書かないでください。ここは相談先ではありません。困っていることは先生に直接話してください。");
  await expect(sheet.getByRole("button", { name: "送る", exact: true })).toBeDisabled();

  await sheet.getByRole("radio", { name: "よかった" }).check();
  await sheet.getByRole("button", { name: "送る", exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(page.locator(".feedback-thanks")).toHaveText("ありがとう");

  await page.getByRole("button", { name: "感想を送る" }).click();
  await expect(sheet.getByRole("radio", { name: "よかった" })).not.toBeChecked();
  await sheet.getByRole("radio", { name: "動かない" }).check();
  await sheet.getByLabel("くわしく").fill("<script>alert(1)</script>");
  await sheet.getByRole("button", { name: "送る", exact: true }).click();
  await expect(sheet).toBeHidden();
});

test("改善点の書きかけは、画面を移っても消えない", async ({ page }) => {
  await enter(page);
  await page.getByRole("button", { name: "感想を送る" }).click();
  const sheet = page.getByRole("dialog", { name: "感想を送る" });
  await sheet.getByRole("radio", { name: "こうしたい" }).check();
  await sheet.getByLabel("くわしく").fill("書きかけの言葉");
  await sheet.getByRole("button", { name: "閉じる", exact: true }).click();

  await page.goto("/teams");
  await page.getByRole("button", { name: "感想を送る" }).click();
  await expect(sheet.getByLabel("くわしく")).toHaveValue("書きかけの言葉");
  await expect(sheet.getByRole("radio", { name: "こうしたい" })).toBeChecked();
});

test("改善点は投稿にも他の画面にも出ず、入口は右上の1つだけ", async ({ page }) => {
  await enter(page);
  const secret = `改善の本文 ${test.info().testId}`;
  const response = await page.request.post("/api/feedback", { data: { kind: "こうしたい", body: secret, path: "/" } });
  expect(response.status()).toBe(200);
  for (const path of ["/", "/teams", "/minna", "/me", "/chie"]) {
    await page.goto(path);
    await expect(page.getByText(secret), path).toHaveCount(0);
  }
  // 入口は右上に浮かぶ1つだけ。「履歴と設定」の中には置かない
  await page.goto("/me?open=trial");
  await expect(page.getByRole("button", { name: "感想を送る" })).toHaveCount(1);
  await expect(page.locator(".feedback-fab")).toBeVisible();
});

test("改善点は合言葉がないと送れず、同じ端末の連打を止める", async ({ page, playwright }) => {
  const outside = await playwright.request.newContext({ baseURL: `http://127.0.0.1:${Number(process.env.KOEKATA_E2E_PORT ?? 3100) + 1}` });
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
    const card = page.getByRole("dialog", { name: "試用版について" });
    await expect(card).toContainText(NOTICE);
    await expect(card).toBeInViewport({ ratio: 1 });
    // 注意は1か所だけ。窓の中に同じ注意を重ねて出さない
    await expect(page.locator(".promise")).toHaveCount(0);
    await card.getByRole("button", { name: "わかった" }).click();
    // 閉じた直後に、右上の感想のアイコンが弾んで場所を教える
    await expect(page.locator(".feedback-fab")).toHaveAttribute("data-bounce", "true");
    await expect(page.getByRole("button", { name: "感想を送る" })).toBeInViewport({ ratio: 1 });
  });

  test("みんなを下まで送って縮んだ桜の帯のメガホンに、右上の感想のアイコンが重ならない", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/access");
    await page.getByLabel("合言葉").fill(CODE);
    await page.getByRole("button", { name: "入る" }).click();
    await page.getByRole("dialog", { name: "試用版について" }).getByRole("button", { name: "わかった" }).click();
    await page.goto("/minna");
    // その日はじめての今日の3人は、Escape で閉じる
    const today = page.getByRole("dialog", { name: "今日の3人" });
    if (await today.isVisible().catch(() => false)) {
      await page.keyboard.press("Escape");
      await expect(today).toHaveCount(0);
    }
    await page.locator(".minna-scroll").evaluate((element) => element.scrollTo(0, element.scrollHeight));
    await expect(page.locator(".minna-scroll")).toHaveAttribute("data-shrunk", "true");
    const fab = (await page.locator(".feedback-fab").boundingBox())!;
    const band = page.locator('.minna-megaphone[data-place="band"]');
    if ((await band.count()) > 0) {
      const box = (await band.boundingBox())!;
      expect(box.x + box.width, "メガホンの右端").toBeLessThanOrEqual(fab.x);
    }
  });

  test("0-2q：注意カードの間は、後ろで吹き出しも実績解除の知らせも出さず、知らせは感想のアイコンに重ならない", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/access");
    await page.getByLabel("合言葉").fill(CODE);
    await page.getByRole("button", { name: "入る" }).click();
    const card = page.getByRole("dialog", { name: "試用版について" });
    await expect(card).toBeVisible();
    // カードの後ろでは、問いかけの吹き出しを描かず、知らせも待たせる
    await page.waitForTimeout(1500);
    await expect(page.locator(".partner-greeting")).toHaveAttribute("data-waiting", "true");
    await expect(page.locator(".partner-greeting .partner-bubble")).toBeHidden();
    await expect(page.locator(".trophy-toast")).toHaveCount(0);
    await card.getByRole("button", { name: "わかった" }).click();
    // カードが消えてから、吹き出しが出る
    await expect(page.locator(".partner-greeting .partner-bubble")).toBeVisible();
    await expect(page.locator(".partner-greeting")).not.toHaveAttribute("data-waiting", "true");

    // 知らせの置き場（trophy-toast.css）は画面の下の端。同じ形を置いて右上の感想のアイコンに重ならないことを確かめる
    const overlap = await page.evaluate(() => {
      const layer = document.createElement("div");
      layer.className = "trophy-toast-layer";
      layer.innerHTML =
        '<a class="trophy-toast"><span class="trophy-toast-art"></span><span class="trophy-toast-text"><span class="trophy-toast-title">実績解除！ パートナーのほうが緊張した</span></span></a>';
      document.body.append(layer);
      // 出てくる動きの途中ではなく、止まった場所で測る
      const element = layer.querySelector<HTMLElement>(".trophy-toast")!;
      element.style.animation = "none";
      const toast = element.getBoundingClientRect();
      const fab = document.querySelector(".feedback-fab")!.getBoundingClientRect();
      layer.remove();
      return toast.left < fab.right && fab.left < toast.right && toast.top < fab.bottom && fab.top < toast.bottom;
    });
    expect(overlap).toBe(false);
  });
});
