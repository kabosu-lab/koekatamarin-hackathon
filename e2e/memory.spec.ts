import { expect, test } from "@playwright/test";
import { switchPerson } from "./helpers";

test("「これを覚えて」と頼んだことだけが一覧に出て、いつでも消せる。他の人には見えない", async ({ page }) => {
  const kept = `覚えてほしいこと ${test.info().testId}`;
  const notKept = `残さないこと ${test.info().testId}`;
  await page.goto("/");
  await switchPerson(page, "大河原 誠（英語・学年主任）");
  await page.getByRole("button", { name: "文字で書く" }).click();
  for (const text of [kept, notKept]) {
    const count = await page.getByRole("log").locator(".bubble.assistant").count();
    await page.getByLabel("相棒に書く").fill(text);
    await page.getByRole("button", { name: "相棒に送る" }).click();
    await expect(page.getByRole("log").locator(".bubble.assistant")).toHaveCount(count + 1);
  }

  await page.getByRole("button", { name: "これを覚えて" }).first().click();
  await expect(page.getByRole("button", { name: "覚えました" })).toBeDisabled();

  await page.goto("/me");
  const list = page.getByRole("region", { name: "相棒が覚えていること" });
  await expect(list).toContainText(kept);
  await expect(list).toContainText("公開した言葉");
  await expect(list).not.toContainText(notKept);

  await page.goto("/");
  await switchPerson(page, "野田 翔（情報・ものづくり部顧問）");
  await page.goto("/me");
  await expect(page.getByText(kept)).toHaveCount(0);

  await page.goto("/");
  await switchPerson(page, "大河原 誠（英語・学年主任）");
  await page.goto("/me");
  await list.locator(".memory-item").filter({ hasText: kept }).getByRole("button", { name: "忘れて" }).click();
  await expect(list).not.toContainText(kept);
  await page.reload();
  await expect(list).not.toContainText(kept);
});
