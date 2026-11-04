import { describe, expect, it } from "vitest";
import { resolveViewer, selectablePeople, type Person } from "./people";

const people: Person[] = [
  { id: "saeki", name: "佐伯", role: "teacher", label: "担任" },
  { id: "fujimoto", name: "藤本", role: "admin", label: "教頭" },
  { id: "aoki", name: "青木", role: "student", label: "2年" },
  { id: "kinoshita", name: "木下", role: "student", label: "3年" },
];

describe("人物の選び方", () => {
  it("ふだんは全員を選べて、最初は決まった先生", () => {
    expect(selectablePeople(people, false)).toHaveLength(4);
    expect(resolveViewer(people, undefined, false).id).toBe("saeki");
    expect(resolveViewer(people, "fujimoto", false).id).toBe("fujimoto");
  });

  it("試用では生徒だけを選べて、最初も生徒", () => {
    expect(selectablePeople(people, true).map((p) => p.id)).toEqual(["aoki", "kinoshita"]);
    expect(resolveViewer(people, undefined, true).id).toBe("aoki");
    expect(resolveViewer(people, "kinoshita", true).id).toBe("kinoshita");
  });

  it("試用で cookie を先生に書き換えても、先生にならない", () => {
    expect(resolveViewer(people, "saeki", true).role).toBe("student");
    expect(resolveViewer(people, "fujimoto", true).role).toBe("student");
  });
});
