import { expect, type Page, test } from "@playwright/test";
import { PROMISE_SEEN } from "./promise-seen";

// 見た目を選んでいない人が、最初にどう見えるかを確かめる
test.use({ storageState: { cookies: PROMISE_SEEN, origins: [] } });

async function asPerson(page: Page, id: string) {
  await page.context().addCookies([{ name: "koekata_person", value: id, domain: "127.0.0.1", path: "/" }]);
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
}

async function say(page: Page, words: string) {
  await page.getByLabel("パートナーに書く").fill(words);
  await page.getByRole("button", { name: "パートナーへ送る" }).click();
}

test("生徒はレトロから始まり、液晶のパートナー、入力欄、真ん中のマイク、左右の丸ボタンが1画面にある", async ({ page }) => {
  await asPerson(page, "aoki");
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "retro");
  await expect(page.getByRole("img", { name: "青木 ひよりさんのパートナー" })).toBeVisible();
  await expect(page.getByLabel("パートナーに書く")).toBeVisible();
  const mic = await page.getByRole("button", { name: "押し続けて話す" }).boundingBox();
  const send = await page.getByRole("button", { name: "とどける" }).boundingBox();
  const photo = await page.locator("label.device-side").boundingBox();
  expect(mic && mic.y + mic.height <= page.viewportSize()!.height).toBe(true);
  expect(mic && mic.height >= 44).toBe(true);
  // マイクが真ん中で、左に写真、右にとどける
  expect(photo!.x + photo!.width <= mic!.x).toBe(true);
  expect(mic!.x + mic!.width <= send!.x).toBe(true);
  await noOverflow(page);
});

test("書いてパートナーと話し、とどけるで下書きを確かめる。Teams の見え方の中で直接直せる", async ({ page }) => {
  await asPerson(page, "aoki");
  await page.goto("/");
  const words = `部活のことを話したい ${test.info().testId}`;
  await say(page, words);
  await expect(page.getByRole("log").locator(".bubble.assistant").last()).toBeVisible();
  await page.getByRole("button", { name: "とどける" }).click();
  const body = page.getByLabel("投稿の文章");
  await expect(body).toHaveValue(words);
  // 文章は Teams の見え方の中に1か所だけ
  await expect(page.locator(".preview").getByLabel("投稿の文章")).toBeVisible();
  await expect(page.locator(".compose-card textarea")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "本人として送る" })).toBeVisible();
  await noOverflow(page);
});

test("やり取りは液晶の中だけで動き、窓を指でなでると読み返せる", async ({ page }) => {
  await asPerson(page, "aoki");
  await page.goto("/");
  for (let i = 0; i < 4; i += 1) {
    await say(page, `長い話 ${i} ${"あ".repeat(120)}`);
    await expect(page.getByRole("log").locator(".bubble.assistant")).toHaveCount(i + 1);
  }
  const log = page.getByRole("log");
  expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
  expect(await log.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
});

/** 輪の上をなぞる（角度の並びを順にたどる） */
async function traceWheel(page: Page, degrees: number[], end?: { x: number; y: number }) {
  const wheel = (await page.locator(".click-wheel").boundingBox())!;
  const cx = wheel.x + wheel.width / 2;
  const cy = wheel.y + wheel.height / 2;
  const r = wheel.width * 0.44;
  const at = (deg: number) => ({ x: cx + r * Math.cos((deg * Math.PI) / 180), y: cy + r * Math.sin((deg * Math.PI) / 180) });
  await page.mouse.move(at(degrees[0]).x, at(degrees[0]).y);
  await page.mouse.down();
  for (const deg of degrees.slice(1)) await page.mouse.move(at(deg).x, at(deg).y, { steps: 2 });
  if (end) await page.mouse.move(cx + end.x, cy + end.y, { steps: 2 });
  await page.mouse.up();
}

test("0-1g(3)：輪をなぞると機能のチップが出て、離すと真ん中の機能が開く", async ({ page }) => {
  await asPerson(page, "aoki");
  await page.goto("/");
  await traceWheel(page, [0, 20, 40, 60]);
  await expect(page).not.toHaveURL(/127\.0\.0\.1:\d+\/$/, { timeout: 5000 });
});

test("0-2w：輪をなぞると、なぞっている間にカリの音を作る（3kHz の雑音と 800Hz の歯）", async ({ page }) => {
  await page.addInitScript(() => {
    const made = { filters: [] as BiquadFilterNode[], oscillators: [] as OscillatorNode[] };
    (window as unknown as { soundMade: typeof made }).soundMade = made;
    const proto = AudioContext.prototype;
    const filter = proto.createBiquadFilter;
    proto.createBiquadFilter = function (this: AudioContext) {
      const node = filter.call(this);
      made.filters.push(node);
      return node;
    };
    const oscillator = proto.createOscillator;
    proto.createOscillator = function (this: AudioContext) {
      const node = oscillator.call(this);
      made.oscillators.push(node);
      return node;
    };
  });
  await asPerson(page, "aoki");
  await page.goto("/");
  const wheel = (await page.locator(".click-wheel").boundingBox())!;
  const cx = wheel.x + wheel.width / 2;
  const cy = wheel.y + wheel.height / 2;
  const r = wheel.width * 0.44;
  const at = (deg: number) => ({ x: cx + r * Math.cos((deg * Math.PI) / 180), y: cy + r * Math.sin((deg * Math.PI) / 180) });
  await page.mouse.move(at(0).x, at(0).y);
  await page.mouse.down();
  for (const deg of [20, 40, 60, 80, 100]) await page.mouse.move(at(deg).x, at(deg).y, { steps: 3 });
  const counts = () =>
    page.evaluate(() => {
      const made = (window as unknown as { soundMade: { filters: BiquadFilterNode[]; oscillators: OscillatorNode[] } }).soundMade;
      return {
        clicks: made.filters.filter((node) => node.type === "bandpass" && node.frequency.value === 3000).length,
        teeth: made.oscillators.filter((node) => node.frequency.value === 800).length,
      };
    });
  // 指を離す前（なぞっている間）に、もう作られている
  await expect.poll(() => counts().then((made) => made.clicks)).toBeGreaterThan(0);
  const made = await counts();
  expect(made.teeth).toBe(made.clicks);
  // 真ん中で離してやめる（開いて画面が替わらないように）
  await page.mouse.move(cx, cy, { steps: 2 });
  await page.mouse.up();
});

test("0-1g(3)：真ん中のマイクの上で離すと、何も開かずにやめる", async ({ page }) => {
  await asPerson(page, "aoki");
  await page.goto("/");
  await traceWheel(page, [0, 20, 40, 60], { x: 0, y: 0 });
  await page.waitForTimeout(600);
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
  await expect(page.locator(".wheel-carousel")).toHaveAttribute("data-state", "idle");
});

test("0-2o：ホイールを出すと最初はホームが真ん中で、チップが替わると説明の一文も替わる", async ({ page }) => {
  await asPerson(page, "aoki");
  await page.goto("/");
  const wheel = (await page.locator(".click-wheel").boundingBox())!;
  const cx = wheel.x + wheel.width / 2;
  const cy = wheel.y + wheel.height / 2;
  const r = wheel.width * 0.44;
  const at = (deg: number) => ({ x: cx + r * Math.cos((deg * Math.PI) / 180), y: cy + r * Math.sin((deg * Math.PI) / 180) });
  const caption = page.locator(".wheel-carousel-caption");
  await expect(caption).toHaveAttribute("aria-live", "polite");
  await page.mouse.move(at(0).x, at(0).y);
  await page.mouse.down();
  await page.mouse.move(at(10).x, at(10).y);
  await page.mouse.move(at(20).x, at(20).y);
  await expect(page.locator(".wheel-carousel")).toHaveAttribute("data-state", "turning");
  await expect(page.locator('.wheel-carousel-slot[data-center="true"]')).toContainText("ホーム");
  await expect(caption).toHaveText(/^ホーム：/);
  await expect(caption).toBeVisible();
  for (const deg of [35, 50, 65, 80]) await page.mouse.move(at(deg).x, at(deg).y, { steps: 2 });
  await expect(caption).not.toHaveText(/ホーム/);
  await expect(caption).toHaveText(/^.+：.+/);
  // 真ん中のマイクの上で離して、何も開かずにやめる
  await page.mouse.move(cx, cy, { steps: 2 });
  await page.mouse.up();
  await expect(page.locator(".wheel-carousel")).toHaveAttribute("data-state", "idle");
});

test("0-2o：真ん中のホームを選ぶと、話す画面のままホイールが閉じる", async ({ page }) => {
  await asPerson(page, "aoki");
  await page.goto("/");
  // 開く動きを通ったか（やめたのではなく、ホームを開いたか）を記録する
  await page.evaluate(() => {
    const root = document.querySelector(".wheel-carousel")!;
    const seen: string[] = [];
    (window as unknown as { wheelStates: string[] }).wheelStates = seen;
    new MutationObserver(() => seen.push(root.getAttribute("data-state") ?? "")).observe(root, { attributes: true, attributeFilter: ["data-state"] });
  });
  // 12度を越えたところで出るだけにして、回さずに離す
  await traceWheel(page, [0, 20]);
  await expect(page.locator(".wheel-carousel")).toHaveAttribute("data-state", "idle");
  expect(await page.evaluate(() => (window as unknown as { wheelStates: string[] }).wheelStates)).toContain("opening");
  await page.waitForTimeout(600);
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
  await expect(page.locator(".click-wheel")).toBeVisible();
});

test("命や安全の案内はレトロでも液晶の中に見える", async ({ page }) => {
  await asPerson(page, "aoki");
  await page.goto("/");
  await say(page, "親に殴られている");
  const card = page.getByRole("region", { name: "相談室に伝えました" });
  await expect(card).toContainText("0120-0-78310");
  await expect(card).toBeInViewport();
  await noOverflow(page);
});

test("話す画面の左右のスワイプで、履歴と設定、みんなへ移る", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 } });
  await context.addCookies([{ name: "koekata_person", value: "aoki", domain: "127.0.0.1", path: "/" }]);
  const page = await context.newPage();
  await page.goto("/");
  const swipe = (dx: number) =>
    page.evaluate((distance) => {
      const target = document.body;
      const touch = (x: number) => new Touch({ identifier: 1, target, clientX: x, clientY: 300 });
      target.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, touches: [touch(200)], changedTouches: [touch(200)] }));
      target.dispatchEvent(new TouchEvent("touchend", { bubbles: true, touches: [], changedTouches: [touch(200 + distance)] }));
    }, dx);
  // 画面が動き出す前の指の動きは拾えないので、届くまで繰り返す
  await expect(async () => {
    await swipe(-150);
    await expect(page).toHaveURL(/\/minna$/, { timeout: 1000 });
  }).toPass();
  await page.goto("/");
  await expect(async () => {
    await swipe(150);
    await expect(page).toHaveURL(/\/me$/, { timeout: 1000 });
  }).toPass();
  await expect(page.getByRole("heading", { name: "履歴と設定" })).toBeVisible();
  await context.close();
});

test("横画面では左に液晶と入力欄、右にマイクで、はみ出さない", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 } });
  await context.addCookies([{ name: "koekata_person", value: "aoki", domain: "127.0.0.1", path: "/" }]);
  const page = await context.newPage();
  await page.goto("/");
  const lcd = (await page.locator(".lcd").boundingBox())!;
  const input = (await page.locator(".device-input").boundingBox())!;
  const mic = (await page.getByRole("button", { name: "押し続けて話す" }).boundingBox())!;
  expect(lcd.x + lcd.width <= mic.x).toBe(true);
  expect(input.y >= lcd.y + lcd.height - 1).toBe(true);
  await noOverflow(page);
  await context.close();
});

test("ようすは「パートナー」のタイルから開き、姿と数を1画面で見せ、気分の推定は出さない", async ({ page }) => {
  await asPerson(page, "kinoshita");
  await page.goto("/me?open=partner");
  await page.getByRole("link", { name: /ようす/ }).click();
  const list = page.locator(".yousu dl");
  for (const term of ["すがた", "ありがとう", "つないだ", "覚えたこと"]) await expect(list.getByText(term)).toBeVisible();
  await expect(page.locator("main")).not.toContainText("気分");
  await noOverflow(page);
});

// 撮影の前の決定：「本人として送る」の直後は、幕をかけず、光が飛んで、「届いた！」が窓の中に1秒ほど出る。3列でも左右の列を沈めない
for (const viewport of [
  { width: 390, height: 844 },
  { width: 1180, height: 820 },
]) {
  test(`${viewport.width}×${viewport.height}：送った直後は幕がなく、「届いた！」は窓の中に1秒ほどで消え、左右の列は沈まない`, async ({ page, context }) => {
    await context.addCookies([{ name: "koekata_today_seen", value: "1", domain: "127.0.0.1", path: "/" }]);
    await page.setViewportSize(viewport);
    await asPerson(page, "aoki");
    await page.goto("/");
    const wide = viewport.width > 600;
    const panels = () =>
      page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>(".wide-panel")].map((panel) => {
          const box = panel.getBoundingClientRect();
          const style = getComputedStyle(panel);
          return { x: box.x, y: box.y, width: box.width, height: box.height, opacity: style.opacity, filter: style.filter, transform: style.transform };
        }),
      );
    const before = await panels();
    if (wide) expect(before).toHaveLength(2);
    await say(page, `届ける言葉 ${test.info().testId}`);
    await expect(page.getByRole("log").locator(".bubble.assistant").last()).toBeVisible();
    await page.getByRole("button", { name: "とどける" }).click();
    await page.getByRole("button", { name: "本人として送る" }).click();
    const burst = page.locator(".send-burst");
    await expect(burst).toHaveCount(1, { timeout: 1000 });
    // 幕はない（後ろの画面を覆う地の色も、全体を出し入れする動きもない）
    expect(await burst.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
    expect(await burst.evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
    // 光は飛ぶ
    await expect(page.locator(".send-burst .blob")).toBeAttached();
    // 「届いた！」が見えている間を数え、その間ずっと窓の中に収まっているかを見る
    const seen = await page.evaluate(
      () =>
        new Promise<{ shown: number; inside: boolean }>((resolve) => {
          let start = 0;
          let inside = true;
          const step = () => {
            const reached = document.querySelector(".burst-reached");
            const opacity = reached ? Number(getComputedStyle(reached).opacity) : 0;
            const now = performance.now();
            if (opacity > 0.5) {
              if (!start) start = now;
              const box = reached!.getBoundingClientRect();
              const frame = document.querySelector(".lcd")!.getBoundingClientRect();
              if (box.left < frame.left || box.right > frame.right || box.top < frame.top || box.bottom > frame.bottom) inside = false;
            } else if (start && opacity < 0.1) {
              resolve({ shown: now - start, inside });
              return;
            }
            requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
          // 出ないまま、または消えないまま時間が過ぎたら打ち切る
          setTimeout(() => resolve({ shown: start ? -1 : 0, inside }), 6000);
        }),
    );
    expect(seen.inside, "窓の中に収まる").toBe(true);
    expect(seen.shown, "1秒ほど見えて消える").toBeGreaterThan(400);
    expect(seen.shown).toBeLessThan(1600);
    // 3列では、左右の列は送る前と同じ大きさ・同じ明るさのまま
    if (wide) {
      const after = await panels();
      expect(after).toEqual(before);
      for (const panel of after) {
        expect(panel.opacity).toBe("1");
        expect(panel.filter).toBe("none");
        expect(panel.transform).toBe("none");
      }
    }
    await expect(burst).toHaveCount(0, { timeout: 5000 });
  });
}
