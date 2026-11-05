/** 開発の足跡の1件の文。数字と、最新のコミットの1行だけで、手元の道やトークンは入れない。 */
export function devLogMessage(input: { kind: "test" | "push"; unit: number | null; e2e: number | null; commit: string }): string {
  const commit = input.commit.replace(/\s+/g, " ").trim().slice(0, 120);
  if (input.kind === "push") return `push しました：${commit || "（コミットが読めませんでした）"}`;
  const counts = [input.unit && `単体 ${input.unit}件`, input.e2e && `画面 ${input.e2e}件`].filter(Boolean).join("、");
  return `テストが全部通りました${counts ? `（${counts}）` : ""}。いまの最新：${commit || "（コミットが読めませんでした）"}`;
}

/** テストの出力から件数を拾う。見つからなければ null。 */
export function countsFromOutput(output: string): { unit: number | null; e2e: number | null } {
  const unit = output.match(/Tests\s+(\d+) passed/);
  const e2e = [...output.matchAll(/^\s*(\d+) passed \(/gm)].at(-1);
  return { unit: unit ? Number(unit[1]) : null, e2e: e2e ? Number(e2e[1]) : null };
}
