import { expect, test } from "@playwright/test";
import { switchPerson } from "./helpers";
import { PROMISE_SEEN } from "./promise-seen";

test.use({ storageState: { cookies: PROMISE_SEEN, origins: [] } });

test("ありがとうに肩書きを添えて贈り、受け取って選ぶと、名前の横に出る", async ({ page }) => {
  const title = `師匠${test.info().testId.slice(0, 6)}`;
  await page.goto("/");
  await switchPerson(page, "佐伯 みどり（国語・2年担任）");
  const recipient = "中村 結衣（1年・吹奏楽部）";
  // 0-3d：ありがとうの送る欄はなくなった。肩書きを添える口（/api/thanks）はそのまま
  const sent = await page.evaluate(
    (given) =>
      fetch("/api/thanks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toPersonId: "nakamura", message: "助かりました", title: given }),
      }).then((r) => r.ok),
    title,
  );
  expect(sent).toBe(true);

  await page.goto("/");
  await switchPerson(page, recipient);
  await page.goto("/me?open=settings");
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
  await page.goto("/me?open=thanks");
  const collection = page.getByRole("region", { name: "もらった肩書き" });
  await expect(collection.getByRole("textbox")).toHaveCount(0);
  // 0-3d：ありがとうのタイルにも、入れる欄はない
  await expect(page.getByRole("region", { name: "サンクスカードを送る" })).toHaveCount(0);
});
