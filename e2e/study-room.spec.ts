import { expect, test } from "@playwright/test";

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
    await expect(room.getByRole("img", { name: "勉強中の相棒" }).first()).toBeVisible();
    await expect(room.locator("button, a, input, textarea, video, audio")).toHaveCount(0);
    // 画面の外枠には、デモ用の使う人の切り替えがあるので、自習室の中だけを見る
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
  test(`${name}（${width}px）で、どの景色も横にはみ出さず、相棒が机ごと収まる`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    for (const [time] of SCENES) {
      await page.goto(`/study/room?time=${time}`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, time).toBe(0);

      const scene = await page.locator(".room-scene").boundingBox();
      // 広い画面でも、景色が細い列に押し込められない（横のナビの 160px と余白を除いた幅）
      if (width >= 768) expect(scene!.width, time).toBeGreaterThan((width - 160) * 0.8);
      const desks = await page.locator(".room-desk").all();
      expect(desks.length).toBeGreaterThan(0);
      for (const desk of desks) {
        const box = await desk.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(scene!.x);
        expect(box!.x + box!.width).toBeLessThanOrEqual(scene!.x + scene!.width + 0.5);
      }
      await expect(page.getByRole("img", { name: "勉強中の相棒" }).first()).toBeVisible();
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

test("動きを減らす設定では、景色も相棒もすべて止まる", async ({ page }) => {
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
