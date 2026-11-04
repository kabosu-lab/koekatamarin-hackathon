import { expect, test } from "@playwright/test";
import { switchPerson } from "./helpers";

test.use({ storageState: { cookies: [], origins: [] } });

test("ありがとうに肩書きを添えて贈り、受け取って選ぶと、名前の横に出る", async ({ page }) => {
  const title = `師匠${test.info().testId.slice(0, 6)}`;
  await page.goto("/");
  await switchPerson(page, "佐伯 みどり（国語・2年担任）");
  await page.goto("/me");
  const form = page.getByRole("region", { name: "サンクスカードを送る" });
  const recipient = "中村 結衣（1年・吹奏楽部）";
  await form.getByLabel("送る相手").selectOption({ label: recipient });

  await form.getByRole("button", { name: "案を出す" }).click();
  await form.getByRole("button", { name: "台本の相談役" }).click();
  await expect(form.getByLabel("肩書きを添える")).toHaveValue("台本の相談役");
  await form.getByLabel("肩書きを添える").fill(title);
  await form.getByLabel("ありがとうの言葉").fill("助かりました");
  await form.getByRole("button", { name: "サンクスカードを送る" }).click();
  await expect(form).toContainText("ありがとうが届きました");

  await page.goto("/");
  await switchPerson(page, recipient);
  await page.goto("/me");
  const collection = page.getByRole("region", { name: "もらった肩書き" });
  const item = collection.getByRole("listitem").filter({ hasText: title });
  await expect(item).toContainText("佐伯 みどりさんから");
  await expect(page.locator(".me-name")).not.toContainText(title);

  await item.getByRole("button", { name: "受け取る" }).click();
  await item.getByRole("button", { name: "名前の横に出す" }).click();
  await page.reload();
  await expect(page.locator(".me-name")).toContainText(title);
  await expect(page.locator(".me-name .person-title")).toBeVisible();

  await item.getByRole("button", { name: "外す" }).click();
  await page.reload();
  await expect(page.locator(".me-name")).not.toContainText(title);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
});

test("選んだ肩書きは、他の人の画面でも名前の横に出る（モダンでも）", async ({ page }) => {
  await page.goto("/people/noda");
  await expect(page.locator(".person-title")).toHaveText("3D プリンターの相談役");
  await page.goto("/teams?channel=making");
  await expect(page.locator(".person-title").first()).toBeVisible();
});

test("受け取るまで、贈られた肩書きは他の人に見えない", async ({ page }) => {
  await page.goto("/people/saeki");
  await expect(page.getByText("作文の一言名人")).toHaveCount(0);
});

test("肩書きは自分では作れない（入れる場所がない）", async ({ page }) => {
  await page.goto("/me");
  const collection = page.getByRole("region", { name: "もらった肩書き" });
  await expect(collection.getByRole("textbox")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "サンクスカードを送る" }).getByLabel("送る相手").locator("option", { hasText: "佐伯 みどり" })).toHaveCount(0);
});
