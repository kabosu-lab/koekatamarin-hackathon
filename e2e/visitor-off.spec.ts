import { expect, test } from "@playwright/test";

// 0-3n：訪問者ごとに分けるのはみんな用（KOEKATA_PUBLIC=1）だけ。ふつうの動きでは訪問者の cookie を出さない
test("みんな用でなければ、訪問者の cookie を出さない", async ({ page }) => {
  await page.goto("/");
  await page.goto("/minna");
  expect((await page.context().cookies()).some((c) => c.name === "koekata_visitor")).toBe(false);
});
