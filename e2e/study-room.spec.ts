import { expect, test } from "@playwright/test";
import { openScreen } from "./helpers";

const SCENES = [
  ["morning", "library", "朝の図書館"],
  ["day", "garden", "昼の校庭の桜の下"],
  ["evening", "classroom", "夕方の教室"],
  ["night", "cafe", "夜のカフェ"],
] as const;

for (const [time, place, label] of SCENES) {
  test(`${label}は、コードの絵だけで描かれ、言葉がない`, async ({ page }) => {
    const external: string[] = [];
    page.on("request", (request) => {
      if (request.resourceType() === "image" && !new URL(request.url()).pathname.startsWith("/api/avatar/art/")) {
        external.push(request.url());
      }
    });
    await page.goto(`/study/room?time=${time}`);
    const room = page.getByRole("region", { name: "自習室" });
    await expect(room).toHaveText(/^いま \d+ 人が勉強しています$/);
    await expect(room.locator(".room-scene")).toHaveAttribute("data-place", place);
    await expect(room.getByRole("img", { name: label })).toBeVisible();
    await expect(room.getByRole("img", { name: "勉強中のパートナー" }).first()).toBeVisible();
    await expect(room.locator("button, a, input, textarea, video, audio")).toHaveCount(0);
    // 景色の中に、人の名前や順位を出さない
    await expect(room.getByText(/順位|ランキング|青木|中村/)).toHaveCount(0);
    expect(external).toEqual([]);
  });
}

for (const [width, height, name] of [
  [320, 568, "小さなスマホ"],
  [390, 844, "スマホ"],
  [768, 1024, "iPad の縦"],
  [1024, 768, "iPad の横"],
] as const) {
  test(`${name}（${width}px）で、どの景色も横にはみ出さず、パートナーが机ごと収まる`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    for (const [time] of SCENES) {
      // 0-2y：iPad の横では、3列の右の列の中に開く。列の幅で確かめる
      const screen = await openScreen(page, `/study/room?time=${time}`);
      const overflow = await screen.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, time).toBe(0);
      const inner = await screen.evaluate(() => innerWidth);

      const scene = await screen.locator(".room-scene").boundingBox();
      // 広い画面でも、景色が細い列に押し込められない（横のナビの 160px と余白を除いた幅）
      if (inner >= 768) expect(scene!.width, time).toBeGreaterThan((inner - 160) * 0.8);
      const desks = await screen.locator(".room-desk").all();
      expect(desks.length).toBeGreaterThan(0);
      for (const desk of desks) {
        const box = await desk.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(scene!.x);
        expect(box!.x + box!.width).toBeLessThanOrEqual(scene!.x + scene!.width + 0.5);
      }
      await expect(screen.getByRole("img", { name: "勉強中のパートナー" }).first()).toBeVisible();
      await page.screenshot({ path: info.outputPath(`${width}-${time}.png`), fullPage: true });
    }
  });
}

test("動きは transform と opacity だけで、ゆったりしている", async ({ page }) => {
  await page.goto("/study/room?time=night");
  const animations = await page.evaluate(() =>
    document
      .getAnimations()
      .filter((animation) => {
        const target = (animation.effect as KeyframeEffect | null)?.target;
        return target instanceof Element && target.closest(".room-scene") !== null;
      })
      .map((animation) => {
        const effect = animation.effect as KeyframeEffect;
        const properties = new Set(
          effect.getKeyframes().flatMap((frame) => Object.keys(frame)),
        );
        for (const known of ["offset", "computedOffset", "easing", "composite"]) properties.delete(known);
        return { properties: [...properties], duration: Number(effect.getTiming().duration) };
      }),
  );
  expect(animations.length).toBeGreaterThan(0);
  for (const { properties, duration } of animations) {
    expect(properties.every((name) => name === "transform" || name === "opacity"), properties.join()).toBe(true);
    expect(duration).toBeGreaterThanOrEqual(3000);
  }
});

test("動きを減らす設定では、景色もパートナーもすべて止まる", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [time] of SCENES) {
    await page.goto(`/study/room?time=${time}`);
    const running = await page.evaluate(
      () =>
        document.getAnimations().filter((animation) => {
          const target = (animation.effect as KeyframeEffect | null)?.target;
          return target instanceof Element && target.closest(".room-scene") !== null;
        }).length,
    );
    expect(running, time).toBe(0);
    await expect(page.locator(".room-scene .pose.study").first()).toBeVisible();
    await expect(page.locator(".room-scene .pose.highfive").first()).toHaveCSS("transform", "matrix(0, 0, 0, 0, 0, 0)");
  }
});

test("夜遅くは休むことをすすめ、ハイタッチも応援もせず、灯りを落とす", async ({ page }) => {
  await page.goto("/study/room?time=late");
  await expect(page.getByText("今日はここまでにして、休みませんか")).toBeVisible();
  const scene = page.locator(".room-scene");
  await expect(scene).toHaveAttribute("data-late", "true");
  await expect(scene.locator(".study-buddy.left, .study-buddy.right, .room-spark")).toHaveCount(0);
  await expect(scene.locator(".study-buddy.solo").first()).toBeVisible();
  await expect(page.getByText(/もう少し|頑張ろう|がんばろう|続けよう/)).toHaveCount(0);
});

test("音を鳴らすものも、カメラやマイクを使うものもない", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { mediaCalls: number }).mediaCalls = 0;
    const count = () => {
      (window as unknown as { mediaCalls: number }).mediaCalls += 1;
      return Promise.reject(new Error("使わない"));
    };
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = count;
  });
  await page.goto("/study/room");
  await expect(page.locator("audio, video")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { mediaCalls: number }).mediaCalls)).toBe(0);
});

for (const [width, height, name] of [
  [390, 844, "スマホ"],
  [768, 1024, "iPad の縦"],
  [1024, 768, "iPad の横"],
] as const) {
  test(`${name}で、新しい形にそろっている：下のタブのナビも「デモ用：使う人」もなく、中だけのスクロールも切れる文もない`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    // 0-2y：iPad の横では、3列の右の列の中
    const screen = await openScreen(page, "/study/room?time=evening");
    await expect(screen.getByRole("heading", { name: "自習室" })).toBeVisible();
    await expect(screen.getByRole("link", { name: /みんな/ }).first()).toBeVisible();
    await expect(screen.getByRole("navigation", { name: "画面の切り替え" })).toBeHidden();
    await expect(screen.getByText("デモ用：使う人")).toBeHidden();
    await expect(screen.locator("select:visible")).toHaveCount(0);

    const problems = await screen.evaluate(() =>
      [...document.querySelectorAll("main *")].flatMap((element) => {
        const style = getComputedStyle(element);
        const found: string[] = [];
        // 入れ物の中だけのスクロール
        if (/(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1) found.push(`中だけのスクロール: ${element.className}`);
        // 途中で切れる文
        if (style.textOverflow === "ellipsis" || (style.webkitLineClamp && style.webkitLineClamp !== "none")) found.push(`切れる文: ${element.className}`);
        return found;
      }),
    );
    expect(problems).toEqual([]);
    await page.screenshot({ path: info.outputPath(`new-form-${width}.png`), fullPage: true });
  });
}
