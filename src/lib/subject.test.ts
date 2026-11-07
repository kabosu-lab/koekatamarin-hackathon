import { describe, expect, it } from "vitest";
import { cardKind, kindOfTag,nextTag, normalizeSubject, splitSubject, SUBJECT_TAGS, subjectFromText } from "./subject";

describe("件名と種類の札（0-3b）", () => {
  it("札と言葉に分け、知らない札は札として扱わない", () => {
    expect(splitSubject("【うまくいった】声を小さくした")).toEqual({ tag: "うまくいった", title: "声を小さくした" });
    expect(splitSubject("【なにか】声")).toEqual({ tag: null, title: "【なにか】声" });
    expect(splitSubject("声だけ")).toEqual({ tag: null, title: "声だけ" });
  });

  it("札は押すと次に回り、最後の次は最初に戻る", () => {
    let tag = SUBJECT_TAGS[0].label as ReturnType<typeof nextTag>;
    const seen: string[] = [];
    for (let i = 0; i < SUBJECT_TAGS.length; i++) {
      seen.push(tag);
      tag = nextTag(tag);
    }
    expect(seen).toEqual(["うまくいった", "困りごと", "聞きたい", "お知らせ", "頑張り", "ありがとう", "がんばったね", "おめでとう"]);
    expect(tag).toBe("うまくいった");
  });

  it("札がなければ種類から付け、札があれば札から種類を決める。改行は空白にし、長すぎれば切る", () => {
    expect(normalizeSubject("テストの点が上がった", "effort")).toEqual({ subject: "【頑張り】テストの点が上がった", kind: "effort" });
    expect(normalizeSubject("【困りごと】プリンタが動かない", "report")).toEqual({ subject: "【困りごと】プリンタが動かない", kind: "trouble" });
    expect(normalizeSubject("【聞きたい】\n席替えの\nコツ", "report").subject).toBe("【聞きたい】席替えの コツ");
    expect(normalizeSubject("  ", "report").subject).toBe("");
    expect(normalizeSubject(`【お知らせ】${"あ".repeat(100)}`, "report").subject.length).toBe(60);
    // 学校からのお知らせ（notice）と分けるため、本人の【お知らせ】は report に残す
    expect(kindOfTag("お知らせ")).toBe("report");
  });

  it("0-3d：ありがとう・がんばったね・おめでとうの札はカード。ほかの札と札なしはカードでない", () => {
    expect(cardKind("【ありがとう】野田先生へ")).toBe("thanks");
    expect(cardKind("【がんばったね】中村さんへ")).toBe("effort");
    expect(cardKind("【おめでとう】県大会")).toBe("congrats");
    expect(cardKind("【頑張り】走った")).toBeNull();
    expect(cardKind("ありがとう")).toBeNull();
    expect(cardKind(null)).toBeNull();
    // 札を回すと、カードからふつうの投稿に戻る
    expect(cardKind(`【${nextTag("おめでとう")}】県大会`)).toBeNull();
  });

  it("件名のない下書きには、種類の札と本文の頭から件名を作る", () => {
    expect(subjectFromText("過去問を20問解いた。明日も続ける", "effort")).toBe("【頑張り】過去問を20問解いた");
    expect(subjectFromText("", "report")).toBe("");
    // 20字を超える一文も途中で「…」と切らない（読み切れる件名に）
    expect(subjectFromText("今日の授業で、声を小さくしたら、教室が静かになりました。うれしかった", "report")).toBe(
      "【うまくいった】今日の授業で、声を小さくしたら、教室が静かになりました",
    );
    expect(subjectFromText("あ".repeat(100), "report")).toHaveLength(60);
  });
});
