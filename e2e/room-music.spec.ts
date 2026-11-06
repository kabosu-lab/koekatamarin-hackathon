import { expect, test } from "@playwright/test";

type Counted = { audioMade: number; loopsStarted: number };

test("自習室の音は初めは出さず、押すと出る。曲はその場で作って継ぎ目なく回し、ファイルを読まない", async ({ page }) => {
  await page.addInitScript(() => {
    const seen = window as unknown as Counted;
    seen.audioMade = 0;
    seen.loopsStarted = 0;
    const Real = window.AudioContext;
    window.AudioContext = class extends Real {
      constructor() {
        super();
        seen.audioMade += 1;
      }
    };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (this: AudioBufferSourceNode, ...args: Parameters<typeof start>) {
      if (this.loop) seen.loopsStarted += 1;
      return start.apply(this, args);
    };
  });
  const media: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "media" || /\.(wav|mp3|m4a|ogg)(\?|$)/.test(request.url())) media.push(request.url());
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/study/room");
  const music = page.getByRole("region", { name: "みんなで聴く曲" });
  await expect(music).toContainText("いまの曲");
  await expect(music).toContainText(/いま \d+ 人が一緒に聴いています/);
  expect(await page.evaluate(() => (window as unknown as Counted).audioMade)).toBe(0);

  await music.getByRole("button", { name: "音を出す" }).click();
  // 押した瞬間に押した形になる（曲を作り終わるのを待たない）
  await expect(music.getByRole("button", { name: "音を止める" })).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => (window as unknown as Counted).audioMade)).toBe(1);
  await expect.poll(() => page.evaluate(() => (window as unknown as Counted).loopsStarted)).toBe(1);
  await expect(music).not.toContainText("音を用意しています");

  await music.getByRole("button", { name: "音を止める" }).click();
  await expect(music.getByRole("button", { name: "音を出す" })).toBeVisible();
  expect(media).toEqual([]);
  expect(errors).toEqual([]);
});

test("誰かが曲を変えると、全員の画面に新しい曲の名前が出る。誰が変えたかは出さない", async ({ browser }) => {
  const a = await browser.newContext();
  const page = await a.newPage();
  await page.goto("/study/room");
  const b = await browser.newContext();
  const other = await b.newPage();
  await other.goto("/study/room");

  const music = page.getByRole("region", { name: "みんなで聴く曲" });
  const before = await (await page.request.get("/api/room-music")).json();
  expect(before.listening).toBeGreaterThan(0);
  if (before.canChange) {
    await music.getByRole("button", { name: "曲を変える" }).click();
    await expect(music.getByRole("button", { name: "少し待つと変えられます" })).toBeDisabled();
    await expect(music.getByRole("status")).toHaveText("みんなの曲を変えました");
    // 知らせの動きは、設計書の移動の段（160〜260ms）・標準のイージングで、transform と opacity だけ
    const motion = await music.locator(".room-music-toast").evaluate((element) => {
      const style = getComputedStyle(element);
      const rule = [...document.styleSheets]
        .flatMap((sheet) => [...sheet.cssRules])
        .find((item): item is CSSKeyframesRule => item instanceof CSSKeyframesRule && item.name === style.animationName);
      const properties = new Set([...(rule?.cssRules ?? [])].flatMap((frame) => [...(frame as CSSKeyframeRule).style]));
      return { properties: [...properties], duration: parseFloat(style.animationDuration) * 1000, easing: style.animationTimingFunction };
    });
    expect(motion.properties.length).toBeGreaterThan(0);
    expect(motion.properties.every((property) => property === "transform" || property === "opacity"), motion.properties.join()).toBe(true);
    expect(motion.duration).toBeGreaterThanOrEqual(160);
    expect(motion.duration).toBeLessThanOrEqual(260);
    expect(motion.easing).toBe("cubic-bezier(0.2, 0.8, 0.2, 1)");
    const after = await (await page.request.get("/api/room-music")).json();
    expect(after.trackId).not.toBe(before.trackId);

    // もう一人の画面には、何もしなくても数秒で届く
    const theirs = other.getByRole("region", { name: "みんなで聴く曲" });
    await expect(theirs.getByRole("status")).toHaveText(`曲が『${after.name}』に変わりました`);
    await expect(theirs).toContainText(after.name);
    await expect(theirs).not.toContainText(/佐伯|青木|中村|大河原/);

    // 開き直した人にも同じ曲が見える
    const third = await b.newPage();
    await third.goto("/study/room");
    await expect(third.getByRole("region", { name: "みんなで聴く曲" })).toContainText(after.name);
  }
  await a.close();
  await b.close();
});

test("Teams のタブの画面は、桜と自習室だけで、名前も操作も出さず、Teams に埋め込める", async ({ page }) => {
  const response = await page.goto("/tab");
  expect(response?.headers()["content-security-policy"]).toContain("frame-ancestors");
  expect(response?.headers()["content-security-policy"]).toContain("teams.microsoft.com");
  await expect(page.getByRole("heading", { name: "校内のようす" })).toBeVisible();
  await expect(page.getByRole("region", { name: "校内の桜" })).toContainText("今週");
  await expect(page.getByRole("region", { name: "自習室" })).toContainText("人が勉強しています");
  const main = page.locator("main");
  await expect(main.getByRole("button")).toHaveCount(0);
  await expect(main).not.toContainText("佐伯");
  await expect(main).not.toContainText("青木");
});

test("ほかの画面は外の画面に埋め込む許可を出さない", async ({ page }) => {
  for (const path of ["/me", "/study/room"]) {
    const response = await page.goto(path);
    expect(response?.headers()["content-security-policy"] ?? "").not.toContain("teams.microsoft.com");
  }
});
