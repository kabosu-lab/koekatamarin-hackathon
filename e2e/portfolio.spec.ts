import { expect, test } from "@playwright/test";
import { switchPerson } from "./helpers";

// ダミーの日記と投稿は 2026 年度 2 学期にあるので、学期を指定して開く。実行した日で結果が変わらないように
const PAGE = "/portfolio?term=2026-2";

test("ポートフォリオは本人だけに見え、選んで確かめたときだけ Teams に届く", async ({ page }) => {
  await page.goto("/");
  await switchPerson(page, "青木 ひより（2年）");
  await page.goto("/me");
  await expect(page.getByRole("link", { name: "ポートフォリオ" }).first()).toBeVisible();
  await page.goto(PAGE);

  await expect(page.getByRole("heading", { name: "ポートフォリオ", level: 1 })).toBeVisible();
  await expect(page.getByText("あなただけに見えます")).toBeVisible();

  // 日記はたまっていて、初めは何も足されていない
  const days = page.getByRole("region", { name: "たまった日記" });
  await days.locator("summary", { hasText: "2026-09-25" }).click();
  await expect(days).toContainText("ITパスポート");
  await expect(page.getByRole("region", { name: "足したもの" })).toContainText("残したいものを選べます");

  // 本人が選んで足す
  const candidates = page.getByRole("region", { name: "足せるもの" });
  await candidates.locator("summary", { hasText: "あなたの投稿" }).click();
  await candidates.locator(".portfolio-entry").first().getByRole("button", { name: "足す" }).click();
  const added = page.getByRole("region", { name: "足したもの" });
  await expect(added.getByRole("button", { name: "外す" })).toBeVisible();

  // ふりかえりは本人が押すまで残らない
  const reflection = page.getByRole("region", { name: "この学期のふりかえり" });
  await reflection.getByRole("button", { name: "相棒にふりかえりを書いてもらう" }).click();
  const proposal = reflection.getByRole("textbox");
  await expect(proposal).toHaveValue(/やり取りがありました/);
  await proposal.fill("青木のこの学期のふりかえり");
  await page.reload();
  await expect(page.getByText("青木のこの学期のふりかえり")).toHaveCount(0);

  await reflection.getByRole("button", { name: "相棒にふりかえりを書いてもらう" }).click();
  await reflection.getByRole("textbox").fill("青木のこの学期のふりかえり");
  await reflection.getByRole("button", { name: "ポートフォリオに残す" }).click();
  await expect(reflection.getByText("青木のこの学期のふりかえり")).toBeVisible();
  await page.reload();
  await expect(reflection.getByText("青木のこの学期のふりかえり")).toBeVisible();

  // ここまで、校内チャネルには何も届いていない
  await page.goto("/teams?channel=study");
  await expect(page.getByText("2026年度 2学期のふりかえりから")).toHaveCount(0);

  // 選ぶ → 下書き → 確かめる → 送る。初めは何も選ばれておらず、チャネルと範囲も選ぶまで送れない
  await page.goto(PAGE);
  const share = page.getByRole("region", { name: "Teams へ届ける" });
  await expect(share.getByRole("checkbox")).toHaveCount(0);
  await share.getByRole("button", { name: "届ける項目を選ぶ" }).click();
  await expect(share.getByRole("button", { name: "下書きを作る" })).toBeDisabled();
  await expect(share.getByRole("checkbox", { checked: true })).toHaveCount(0);
  await share.getByRole("checkbox", { name: /2026-09-25 日記：ITパスポート/ }).check();
  await share.getByRole("button", { name: "下書きを作る" }).click();

  const preview = share.getByLabel(/Teams にはこう見えます/);
  await expect(preview).toHaveValue(/2026年度 2学期のふりかえりから/);
  await expect(preview).not.toHaveValue(/青木のこの学期のふりかえり/);
  await preview.fill("2026年度 2学期のふりかえりから\n・ITパスポートの勉強を続けました");

  await share.getByRole("button", { name: "言葉を確かめる" }).click();
  await expect(share.getByRole("button", { name: "本人として送る" })).toBeDisabled();
  await share.getByLabel(/^チャネル/).selectOption({ label: "資格の勉強会" });
  await share.getByLabel("見える範囲").selectOption("everyone");
  await share.getByRole("button", { name: "本人として送る" }).click();
  await expect(share.getByText("あなたの名前で届きました")).toBeVisible();

  await page.goto("/teams?channel=study");
  await expect(page.getByText("ITパスポートの勉強を続けました")).toBeVisible();

  // 別の人には見えない
  await page.goto("/");
  await switchPerson(page, "木下 蓮（3年・ものづくり部）");
  await page.goto(PAGE);
  await expect(page.getByText("青木のこの学期のふりかえり")).toHaveCount(0);
});

test("直した言葉が気になるときは伝え、個人攻撃は送れない", async ({ page }) => {
  await page.goto("/");
  await switchPerson(page, "青木 ひより（2年）");
  await page.goto(PAGE);
  const share = page.getByRole("region", { name: "Teams へ届ける" });
  await share.getByRole("button", { name: "届ける項目を選ぶ" }).click();
  await share.getByRole("checkbox", { name: /2026-09-25 日記：ITパスポート/ }).check();
  await share.getByRole("button", { name: "下書きを作る" }).click();
  await share.getByLabel(/Teams にはこう見えます/).fill("死ね");
  await share.getByRole("button", { name: "言葉を確かめる" }).click();
  await expect(share.getByRole("alert")).toContainText("送れない");
  await expect(share.getByRole("button", { name: "本人として送る" })).toHaveCount(0);
});

test("送った直後なら、取り消すと Teams から消える", async ({ page }) => {
  await page.goto("/");
  await switchPerson(page, "青木 ひより（2年）");
  await page.goto(PAGE);
  const share = page.getByRole("region", { name: "Teams へ届ける" });
  await share.getByRole("button", { name: "届ける項目を選ぶ" }).click();
  await share.getByRole("checkbox", { name: /2026-09-25 日記：ITパスポート/ }).check();
  await share.getByRole("button", { name: "下書きを作る" }).click();
  await share.getByLabel(/Teams にはこう見えます/).fill("取り消して確かめる投稿");
  await share.getByRole("button", { name: "言葉を確かめる" }).click();
  await share.getByLabel(/^チャネル/).selectOption({ label: "資格の勉強会" });
  await share.getByLabel("見える範囲").selectOption("everyone");
  await share.getByRole("button", { name: "本人として送る" }).click();
  await share.getByRole("button", { name: "取り消す" }).click();
  await expect(page.getByText("取り消しました")).toBeVisible();
  await page.goto("/teams?channel=study");
  await expect(page.getByText("取り消して確かめる投稿")).toHaveCount(0);
});
