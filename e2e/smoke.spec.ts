import { expect, test } from "@playwright/test";
import { SCHEMA_VERSION } from "../src/lib/db";
import { people } from "../src/lib/seed-data";

test("スマホ幅で最初の画面が横にはみ出さず表示される", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("コエカタ");
  await expect(page.getByRole("heading", { name: "コエカタ" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});

test("サーバーからダミーのデータまでつながっている", async ({ request }) => {
  const response = await request.get("/api/health");

  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual({
    status: "ok",
    schemaVersion: SCHEMA_VERSION,
    peopleCount: people.length,
  });
});
