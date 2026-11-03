import { expect, test } from "@playwright/test";
import { switchPerson } from "./helpers";

test("自習室は人数と相棒だけで、Teams のタブの画面には操作がない", async ({ page }) => {
  await page.goto("/teams");
  await page.getByRole("link", { name: "自習室（タブ）" }).click();
  await expect(page.getByRole("heading", { name: "自習室" })).toBeVisible();
  const room = page.getByRole("region", { name: "自習室" });
  await expect(room).toContainText("人が勉強しています");
  await expect(room.getByRole("img", { name: "勉強中の相棒" }).first()).toBeVisible();
  await expect(room.getByRole("button")).toHaveCount(0);
  await expect(room.getByText(/青木|中村/)).toHaveCount(0);
});

test("25分のタイマーが終わると問いかけが出て、本人が選べば投稿になる", async ({ page }) => {
  const words = `今日は過去問を解いた ${test.info().testId}`;
  await page.clock.install();
  await page.goto("/");
  await switchPerson(page, "川村 陽菜（理科・1年副担任）");
  await page.goto("/study");

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
  await page.goto("/study");
  await page.getByRole("button", { name: /25分/ }).click();
  await expect(page.getByRole("timer")).toContainText(/2[45]:/);
});

test("投稿しないことも選べる", async ({ page }) => {
  await page.goto("/");
  await switchPerson(page, "白石 文（養護・相談室）");
  await page.goto("/study");
  await page.getByRole("button", { name: /25分/ }).click();
  await page.getByRole("button", { name: "ここまでにする" }).click();
  await page.getByRole("button", { name: "投稿しない" }).click();
  await expect(page.getByRole("heading", { name: /やりましたか|進みましたか/ })).toHaveCount(0);
});

test("スマホ幅で横にはみ出さない", async ({ page }) => {
  for (const path of ["/study", "/study/room"]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  }
});
