import { expect, test } from "@playwright/test";

test("自習室の音は初めは出さず、押すと出る。曲は全員で同じで、切り替えると全員に届く", async ({ browser }) => {
  const made = () => (window as unknown as { audioMade: number }).audioMade;
  const a = await browser.newContext();
  const page = await a.newPage();
  await page.addInitScript(() => {
    const Real = window.AudioContext;
    (window as unknown as { audioMade: number }).audioMade = 0;
    window.AudioContext = class extends Real {
      constructor() {
        super();
        (window as unknown as { audioMade: number }).audioMade += 1;
      }
    };
  });
  await page.goto("/study/room");
  const music = page.getByRole("region", { name: "みんなで聴く曲" });
  await expect(music).toContainText("いまの曲");
  expect(await page.evaluate(made)).toBe(0);
  await music.getByRole("button", { name: "音を聴く" }).click();
  await expect(music.getByRole("button", { name: "音を止める" })).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(made)).toBe(1);
  await music.getByRole("button", { name: "音を止める" }).click();
  await expect(music.getByRole("button", { name: "音を聴く" })).toBeVisible();

  const before = await (await page.request.get("/api/room-music")).json();
  const change = music.getByRole("button", { name: /曲を変える|少し待つ/ });
  if (before.canChange) {
    await change.click();
    await expect(music.getByRole("button", { name: "少し待つと変えられます" })).toBeDisabled();
    const after = await (await page.request.get("/api/room-music")).json();
    expect(after.trackId).not.toBe(before.trackId);
    const b = await browser.newContext();
    const other = await b.newPage();
    await other.goto("/study/room");
    await expect(other.getByRole("region", { name: "みんなで聴く曲" })).toContainText(after.name);
    await b.close();
  }
  await a.close();
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
  const response = await page.goto("/me");
  expect(response?.headers()["content-security-policy"] ?? "").not.toContain("teams.microsoft.com");
});
