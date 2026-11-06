import { expect, test } from "@playwright/test";
import { switchPerson } from "./helpers";

test("自習室は人数とパートナーだけで、Teams のタブの画面には操作がない", async ({ page }) => {
  await page.goto("/teams");
  await page.getByRole("link", { name: "自習室（タブ）" }).click();
  await expect(page.getByRole("heading", { name: "自習室" })).toBeVisible();
  const room = page.getByRole("region", { name: "自習室" });
  await expect(room).toContainText("人が勉強しています");
  await expect(room.getByRole("img", { name: "勉強中のパートナー" }).first()).toBeVisible();
  await expect(room.getByRole("button")).toHaveCount(0);
  await expect(room.getByText(/青木|中村/)).toHaveCount(0);
});

test("「一緒に勉強する」は自習室と1つの画面で、前の入口から来ても自習室に着く", async ({ page }) => {
  await page.goto("/study");
  await expect(page).toHaveURL(/\/study\/room$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("自習室（一緒に勉強する）");
  await expect(page.getByRole("link", { name: "‹ みんな" })).toBeVisible();
  // 景色とタイマーと曲が、同じ画面にそろう
  await expect(page.getByRole("region", { name: "自習室" })).toContainText("人が勉強しています");
  await expect(page.getByRole("region", { name: "タイマー" }).getByRole("button", { name: /25分/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "みんなで聴く曲" })).toBeVisible();
});

test("25分のタイマーが終わると問いかけが出て、本人が選べば投稿になる", async ({ page }) => {
  const words = `今日は過去問を解いた ${test.info().testId}`;
  await page.clock.install();
  await page.goto("/");
  await switchPerson(page, "川村 陽菜（理科・1年副担任）");
  await page.goto("/study/room");

  const start = page.getByRole("button", { name: /25分/ });
  await start.click();
  await expect(page.getByRole("timer")).toBeVisible();

  await expect(page.getByRole("timer")).toContainText(/2[45]:/);
  await page.clock.fastForward("25:00");
  await expect(page.getByRole("heading", { name: /やりましたか|進みましたか/ })).toBeVisible();

  await page.getByLabel(/やったこと/).fill(words);
  await page.getByRole("button", { name: "投稿する" }).click();
  await expect(page.getByText("校内チャネルに届きました")).toBeVisible();

  await page.goto("/teams?channel=study");
  await expect(page.getByRole("article").filter({ hasText: words })).toContainText("川村 陽菜");
});

test("端末の時計がずれていても、タイマーはすぐ終わらない", async ({ page }) => {
  await page.clock.install({ time: new Date(Date.now() + 3 * 60 * 60 * 1000) });
  await page.goto("/");
  await switchPerson(page, "大河原 誠（英語・学年主任）");
  await page.goto("/study/room");
  await page.getByRole("button", { name: /25分/ }).click();
  await expect(page.getByRole("timer")).toContainText(/2[45]:/);
});

test("投稿しないことも選べる", async ({ page }) => {
  await page.goto("/");
  await switchPerson(page, "白石 文（養護・相談室）");
  await page.goto("/study/room");
  await page.getByRole("button", { name: /25分/ }).click();
  await page.getByRole("button", { name: "ここまでにする" }).click();
  await page.getByRole("button", { name: "投稿しない" }).click();
  await expect(page.getByRole("heading", { name: /やりましたか|進みましたか/ })).toHaveCount(0);
});

test("スマホ幅で横にはみ出さない", async ({ page }) => {
  for (const path of ["/study/room", "/study/room?time=late"]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  }
});

test("自習室のパートナーは言葉を話さず、人は見るだけで、絵が読み込まれる", async ({ page }) => {
  await page.goto("/study/room");
  const room = page.getByRole("region", { name: "自習室" });
  await expect(room).toHaveText(/^いま \d+ 人が勉強しています$/);
  await expect(room.locator("button, input, textarea, video, audio")).toHaveCount(0);
  const study = room.locator(".pose.study").first();
  await expect.poll(() => study.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
});

test("動きを減らす設定では、パートナーは勉強の姿のままで動かない", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/study/room");
  const buddy = page.locator(".study-buddy").first();
  await expect(buddy).toHaveCSS("animation-name", "none");
  await expect(buddy.locator(".pose.highfive")).toHaveCSS("transform", "matrix(0, 0, 0, 0, 0, 0)");
  await expect(buddy.locator(".pose.study")).toHaveCSS("transform", "none");
});
