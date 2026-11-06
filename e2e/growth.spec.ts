import { expect, test } from "@playwright/test";
import { switchPerson } from "./helpers";

test("下の階層の画面でも、左上の戻る印で、どこから来たかが分かる（下のタブはもうない）", async ({ page }) => {
  for (const path of ["/today", "/daily", "/inbox"]) {
    await page.goto(path);
    await expect(page.locator(".bottom-nav"), path).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^‹ / }).first(), path).toBeVisible();
  }
});

test("最初の問いかけに答えると卵の系統が決まり、絵が読み込まれる", async ({ browser }) => {
  // 他のテストと混ざらないよう、まだパートナーのない佐伯先生の新しい文脈で進める
  const page = await (await browser.newContext()).newPage();
  await page.goto("/me?open=partner");
  const quiz = page.getByRole("region", { name: "最初の問いかけ" });
  if (await quiz.isVisible()) {
    await quiz.getByRole("button", { name: "人物" }).click();
    await quiz.getByRole("button", { name: "じっくり話を聞く" }).click();
    await expect(quiz).toHaveCount(0);
  }
  const image = page.getByRole("region", { name: "パートナー" }).locator("img");
  await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  await page.context().close();
});

test("サンクスカードが相手に届き、他の人には見えない", async ({ page }) => {
  const words = `助かりました ${test.info().testId}`;
  await page.goto("/");
  await switchPerson(page, "青木 ひより（2年）");
  await page.goto("/me?open=thanks");
  const form = page.getByRole("region", { name: "サンクスカードを送る" });
  await form.getByLabel("名前で探す").fill("野田");
  await form.getByRole("list", { name: "見つかった人" }).getByRole("button", { name: /野田 翔さん/ }).click();
  await form.getByLabel("届けることば").fill(words);
  await form.getByRole("button", { name: "サンクスカードを送る" }).click();
  await expect(form).toContainText("ありがとうが届きました");

  await page.goto("/");
  await switchPerson(page, "野田 翔（情報・ものづくり部顧問）");
  await page.goto("/me?open=thanks");
  await expect(page.getByRole("region", { name: "もらったありがとう" })).toContainText(words);

  await page.goto("/");
  await switchPerson(page, "木下 蓮（3年・ものづくり部）");
  await page.goto("/me?open=thanks");
  await expect(page.getByText(words)).toHaveCount(0);
});

test("プロフィールの下書きを確かめ、1回だけ直して載せ、いつでも消せる", async ({ page }) => {
  await page.goto("/");
  await switchPerson(page, "藤本 恵（教頭）");
  await page.goto("/me?open=settings");

  await page.getByRole("button", { name: "プロフィールを更新する" }).click();
  const draft = page.getByRole("group", { name: "プロフィールの下書き" });
  await expect(draft).toContainText("こう載せていい？");

  await draft.getByLabel("ここをこう変えて").fill("短くして");
  await draft.getByRole("button", { name: "この頼みで直す" }).click();
  await expect(draft).toContainText("更新ごとに1回です");
  await expect(draft.getByRole("button", { name: "この頼みで直す" })).toHaveCount(0);
  const text = await draft.locator(".draft-text").innerText();

  await draft.getByRole("button", { name: "これで載せる" }).click();
  await expect(page.getByTestId("profile-text")).toHaveText(text);

  await page.getByRole("button", { name: "プロフィールを消す" }).click();
  await expect(page.getByTestId("profile-text")).toHaveText("まだ載せていません。");
});

test("校内の桜と、周りのパートナーが見える。季節を変えて見られる", async ({ page }) => {
  await page.goto("/sakura");
  await expect(page.getByRole("region", { name: "校内の桜" })).toContainText("今年の葉");
  await expect(page.getByRole("region", { name: "桜のまわりのパートナーたち" }).getByRole("link")).toHaveCount(9);

  await page.getByRole("link", { name: "春を見る" }).click();
  await expect(page.getByRole("region", { name: "校内の桜" })).toContainText("今年の桜が");
  await expect(page.locator(".petal").first()).toBeAttached();

  await page.getByRole("region", { name: "桜のまわりのパートナーたち" }).getByRole("link", { name: /野田 翔/ }).click();
  await expect(page.getByRole("heading", { name: "野田 翔" })).toBeVisible();
  await expect(page.getByRole("region", { name: "応援とコメント" })).toContainText("応援");
});

test("決まった名前以外の絵は読めない", async ({ request }) => {
  expect((await request.get("/api/art/egg.png")).ok()).toBe(true);
  expect((await request.get("/api/art/characters-sheet.png")).status()).toBe(404);
  expect((await request.get("/api/art/..%2F..%2F.env")).status()).toBe(404);
});

test("スマホ幅で横にはみ出さない", async ({ page }) => {
  for (const path of ["/me", "/minna", "/people/noda"]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  }
});

test("Teams の写真（ダミー）からパートナーを作れて、写真のない人には出ない", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/");
  await switchPerson(page, "川村 陽菜（理科・1年副担任・生徒指導）");
  await page.goto("/me?open=partner");
  const section = page.getByRole("region", { name: "写真からパートナーを作る" });
  await expect(section).toContainText("保存しません");
  await section.getByRole("button", { name: "写真から作る" }).click();
  // 写真 → 読み取り → 卵 → 誕生 → 得意なこと
  const hatch = page.getByRole("dialog", { name: "パートナーの誕生" });
  await expect(hatch.getByText("写真の色と雰囲気を読んでいます")).toBeVisible();
  await expect(hatch.getByRole("heading", { name: /生まれた！$/ }).last()).toBeVisible({ timeout: 20_000 });
  await expect(hatch).toContainText("クジラが生まれた！", { timeout: 20_000 });
  await expect(hatch).toContainText("得意：");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  await hatch.getByRole("button", { name: "よろしくね" }).click();
  await expect(section).toHaveCount(0);
  await expect(page.getByRole("region", { name: "パートナー", exact: true })).toContainText("得意：");
  const image = page.getByRole("region", { name: "パートナー" }).locator("img");
  await expect(image).toHaveAttribute("src", /\/api\/avatar\/art\//);
  await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);

  await page.goto("/");
  await switchPerson(page, "野田 翔（情報・ものづくり部顧問）");
  await page.goto("/me?open=partner");
  await expect(page.getByRole("region", { name: "写真からパートナーを作る" })).toHaveCount(0);
  await page.context().close();
});

test("パートナーの絵の配信は、ほかの場所のものを動かさない", async ({ page, request }) => {
  await page.goto("/study/room");
  const src = await page.locator(".study-buddy .pose.study").first().getAttribute("src");
  const response = await request.get(src as string);
  expect(response.headers()["content-type"]).toMatch(/image\/(svg\+xml|png)/);
  expect(response.headers()["content-security-policy"]).toContain("sandbox");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  if (response.headers()["content-type"].includes("svg")) expect(await response.text()).not.toMatch(/<text|<script/);
  expect((await request.get("/api/avatar/art/unknown/study")).status()).toBe(404);
  expect((await request.get(`${(src as string).replace("/study", "/shout")}`)).status()).toBe(404);
});

test("育つと進化の候補から本人が選び、隠している間も育つ", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/");
  await switchPerson(page, "白石 文（養護・相談室）");
  // 今の段階を起点にする
  await page.goto("/me?open=partner");
  const companion = page.getByRole("region", { name: "パートナー", exact: true });
  const before = await companion.locator("img").getAttribute("src");

  // 周りの人からのありがとうで育つ
  const sender = await browser.newContext();
  const senderPage = await sender.newPage();
  await senderPage.goto("/");
  for (let i = 0; i < 12; i++) {
    await senderPage.evaluate(
      async (message) =>
        fetch("/api/thanks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toPersonId: "shiraishi", message }),
        }),
      `助かりました ${i}`,
    );
  }
  await sender.close();
  
  await page.reload();
  const card = page.getByRole("region", { name: "進化", exact: true });
  await expect(card).toBeVisible();
  // 選ぶまで今の姿のまま
  expect(await companion.locator("img").getAttribute("src")).toBe(before);
  await card.getByRole("button", { name: "進化の候補を見る" }).click();
  const choices = card.locator(".evolve-choices button");
  await expect(choices.first()).toBeVisible();
  expect(await choices.count()).toBeGreaterThanOrEqual(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  await choices.last().click();
  await expect(page.getByRole("status").filter({ hasText: "進化！" })).toBeVisible();
  // 選ぶと姿が変わる。たくさん育っていれば、次の段階でまた選べる
  await expect.poll(() => companion.locator("img").getAttribute("src"), { timeout: 15_000 }).not.toBe(before);

  // 隠しても画面は壊れず、戻すとパートナーが出る（隠すのは「設定」のタイル）
  await page.goto("/me?open=settings");
  await page.getByRole("button", { name: "隠す" }).click();
  await expect(page.getByRole("button", { name: "隠す" })).toHaveAttribute("aria-pressed", "true");
  await page.goto("/me?open=partner");
  await expect(page.getByText("パートナーは隠しています")).toBeVisible();
  await expect(companion.locator("img")).toHaveCount(0);
  await page.goto("/me?open=settings");
  await page.getByRole("button", { name: "表示する" }).click();
  await expect(page.getByRole("button", { name: "表示する" })).toHaveAttribute("aria-pressed", "true");
  await page.goto("/me?open=partner");
  await expect(companion.locator("img")).toBeVisible();
  await page.context().close();
});

test("トロフィーが届いて棚に並び、公開を選ぶとプロフィールに出る", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/");
  await switchPerson(page, "大河原 誠（英語・学年主任）");
  await page.goto("/me?open=partner");
  const trophies = page.getByRole("region", { name: "トロフィー" });
  // 棚：もらったものは杯になり、残りは影で見える。数や割合は出さない
  await expect(trophies.locator('[data-slot="first-answer"][data-earned="true"]')).toBeVisible();
  await expect(trophies.locator('[data-earned="false"]').first()).toBeAttached();
  await trophies.getByRole("button", { name: "最初の一歩" }).click();
  await expect(trophies.locator(".ribbon-story")).toContainText("日");

  const viewer = await (await browser.newContext()).newPage();
  await viewer.goto("/people/ogawara");
  await expect(viewer.getByText("最初の一歩")).toHaveCount(0);

  const checkbox = trophies.getByRole("checkbox", { name: "プロフィールに出す" });
  await checkbox.click();
  await expect(checkbox).toBeChecked();
  await expect.poll(async () => {
    await viewer.reload();
    return viewer.getByText("最初の一歩").count();
  }).toBe(1);
  await viewer.context().close();
  await page.context().close();
});

test("取っていない隠しトロフィーは、名前も条件も画面に渡らない", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/");
  await switchPerson(page, "大河原 誠（英語・学年主任）");
  const response = await page.goto("/me?open=partner");
  const html = (await response?.text()) ?? "";
  for (const secret of ["言い直しの勇者", "角が取れました", "言い換えの提案を受け入れて"]) expect(html).not.toContain(secret);
  const trophies = page.getByRole("region", { name: "トロフィー" });
  await trophies.getByRole("button", { name: "隠しトロフィー" }).first().click();
  await expect(trophies.getByText("取るまで、条件はひみつです。")).toBeVisible();
  await page.context().close();
});

test("贈り物の卵を開け、生まれたパートナーを選べる", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/");
  await switchPerson(page, "野田 翔（情報・ものづくり部顧問）");
  await page.goto("/minna");
  await expect(page.getByRole("link", { name: "贈り物の卵が届いています" })).toBeVisible();
  await page.goto("/me?open=partner");
  const section = page.getByRole("region", { name: "贈り物の卵" });
  await section.getByRole("button", { name: "開ける" }).first().click();
  const stage = page.getByRole("dialog", { name: "贈り物の卵" });
  await expect(stage.getByRole("heading", { name: /が生まれた！/ })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  await stage.getByRole("button", { name: "今のパートナーにする" }).click();
  await expect(stage).toHaveCount(0);
  await expect(section.getByRole("button", { name: /今のパートナー/ })).toBeDisabled();
  await page.context().close();
});

test("まだ取っていない棚にも、影と条件が見える", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/");
  await switchPerson(page, "木下 蓮（3年・ものづくり部）");
  await page.goto("/me?open=partner");
  const trophies = page.getByRole("region", { name: "トロフィー" });
  const shelf = trophies.locator(".trophy-shelf").filter({ hasText: "頑張りをたたえる" });
  for (const name of ["有言実行", "逃げなかった人", "帰ってきた人"]) await expect(shelf.getByRole("button", { name })).toBeVisible();
  await shelf.getByRole("button", { name: "逃げなかった人" }).click();
  await expect(shelf.locator(".trophy-detail")).toContainText("止まっていた頑張りたいことに");
  await page.context().close();
});

test("レトロでは、棚と届いた瞬間のトロフィーが液晶の色だけになる", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/");
  await switchPerson(page, "大河原 誠（英語・学年主任）");
  await page.context().addCookies([{ name: "koekata_theme", value: "retro", domain: "127.0.0.1", path: "/" }]);
  await page.goto("/me?open=partner");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "retro");
  await expect(page.locator(".trophy-cup-body").first()).toBeVisible();
  // 届いた瞬間はいつ出るか決まらないので、同じ部品を置いて色を見る
  const colors = await page.evaluate(() => {
    const color = (value: string) => {
      const probe = document.createElement("i");
      probe.style.color = value;
      document.body.append(probe);
      const computed = getComputedStyle(probe).color;
      probe.remove();
      return computed;
    };
    const card = document.createElement("span");
    card.className = "ribbon-card";
    const confetti = document.createElement("i");
    confetti.className = "ribbon-confetti";
    card.append(confetti);
    document.body.append(card);
    const result = {
      ink: color("var(--ink)"),
      ground: color("var(--ground)"),
      cup: getComputedStyle(document.querySelector(".trophy-cup-body") as Element).fill,
      emblem: getComputedStyle(document.querySelector(".trophy-emblem") as Element).fill,
      cardBackground: getComputedStyle(card).backgroundColor,
      confetti: getComputedStyle(confetti).backgroundColor,
    };
    card.remove();
    return result;
  });
  expect(colors.cup).toBe(colors.ink);
  expect(colors.confetti).toBe(colors.ink);
  expect(colors.emblem).toBe(colors.ground);
  expect(colors.cardBackground).toBe(colors.ground);
  await page.context().close();
});

for (const width of [768, 1280]) {
  test(`贈り物の卵とトロフィーは ${width} 幅でも、はみ出さない`, async ({ browser }) => {
    const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
    await page.goto("/");
    await switchPerson(page, "野田 翔（情報・ものづくり部顧問）");
    await page.goto("/me?open=partner");
    await expect(page.getByRole("region", { name: "トロフィー" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    await page.context().close();
  });
}

test("パートナーを隠すと報酬も出ないが、見せると裏で集まっている", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/");
  await switchPerson(page, "白石 文（養護・相談室）");
  await page.goto("/me?open=settings");
  await page.getByRole("button", { name: "隠す", exact: true }).click();
  await expect(page.getByRole("button", { name: "隠す", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.goto("/me?open=partner");
  await expect(page.getByText("パートナーは隠しています")).toBeVisible();
  // コレクション（卵とトロフィー）も出ない
  await expect(page.getByRole("region", { name: "コレクション" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "トロフィー" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "贈り物の卵" })).toHaveCount(0);
  await page.goto("/me?open=settings");
  await page.getByRole("button", { name: "表示する", exact: true }).click();
  await expect(page.getByRole("button", { name: "表示する", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.goto("/me?open=partner");
  await expect(page.getByRole("region", { name: "トロフィー" })).toBeVisible();
  await page.context().close();
});

test("期間中はイベントが桜の画面のメガホンから出て、パートナーを隠すと出ない", async ({ browser }) => {
  const context = await browser.newContext();
  // 今日の3人のモーダルは、出したことにしておく（e2e/minna.spec.ts で確かめる）
  await context.addCookies([{ name: "koekata_today_seen", value: "1", domain: "127.0.0.1", path: "/" }]);
  const page = await context.newPage();
  await page.goto("/minna");
  // はじめての春の見通しは閉じておく
  await page.getByRole("note", { name: "春の見通し" }).getByRole("button", { name: "閉じる" }).click();
  // 0-1y(4)：桜の木のそばの小さなメガホンを押すと、イベントのカードが出る
  const megaphone = page.getByRole("button", { name: "期間限定のイベントのお知らせ" });
  const card = page.getByRole("dialog", { name: "期間限定のイベント" });
  await expect(async () => {
    await megaphone.click();
    await expect(card).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(card.getByText("テスト前の応援週間", { exact: true })).toBeVisible();
  await page.goto("/me?open=settings");
  await page.getByRole("button", { name: "隠す", exact: true }).click();
  await expect(page.getByRole("button", { name: "隠す", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.goto("/minna");
  await expect(page.getByRole("region", { name: "みんな" })).toBeVisible();
  await expect(megaphone).toHaveCount(0);
  await page.context().close();
});
