import { describe, expect, it } from "vitest";
import { batchOf, nextBatchLabel, todayDoneLine } from "./answered";

const cards = Array.from({ length: 8 }, (_, i) => ({ postId: `p${i}` }));

describe("0-3p：今日の3人の束", () => {
  it("最初は3枚。応えたカードは消え、補充はしない", () => {
    expect(batchOf(cards, 1, new Set()).shown.map((c) => c.postId)).toEqual(["p0", "p1", "p2"]);
    const some = batchOf(cards, 1, new Set(["p1"]));
    expect(some.shown.map((c) => c.postId)).toEqual(["p0", "p2"]);
    expect(some.done).toBe(false);
  });

  it("3枚とも応えたら おしまい で、残りの件数が次のおすすめになる。押すと次の3枚", () => {
    const done = batchOf(cards, 1, new Set(["p0", "p1", "p2"]));
    expect(done).toMatchObject({ shown: [], done: true, rest: 5 });
    expect(nextBatchLabel(done.rest)).toBe("次のおすすめを見る（5件）");
    expect(batchOf(cards, 2, new Set(["p0", "p1", "p2"])).shown.map((c) => c.postId)).toEqual(["p3", "p4", "p5"]);
    expect(batchOf(cards, 3, new Set(cards.map((c) => c.postId)))).toMatchObject({ done: true, rest: 0 });
  });

  it("先生には、です・ます", () => {
    expect(todayDoneLine(true)).toBe("今日の3人は、おしまいです。ありがとうございます");
    expect(todayDoneLine(false)).toBe("今日の3人、おしまい。ありがとう");
  });
});
