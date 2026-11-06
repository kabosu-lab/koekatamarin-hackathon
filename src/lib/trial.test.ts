import { afterEach, describe, expect, it, vi } from "vitest";
import { FEEDBACK_ICON_SLOT, trialFeedbackHint, trialNotice, trialSendsToTeams } from "./trial";

afterEach(() => vi.unstubAllEnvs());

describe("試用の一文", () => {
  it("Teams へ送る人が決まっている試用では、Teams に届くことを書く", () => {
    vi.stubEnv("KOEKATA_ACCESS_CODE", "123456");
    vi.stubEnv("KOEKATA_TRIAL_TEAMS_AS", "aoki");
    vi.stubEnv("KOEKATA_TEAMS", "");
    expect(trialSendsToTeams()).toBe(true);
    expect(trialNotice()).toContain("練習用の Teams");
  });

  it("審査員用のように Teams へ送らない試用では、Teams のことを書かない", () => {
    vi.stubEnv("KOEKATA_ACCESS_CODE", "123456");
    vi.stubEnv("KOEKATA_TRIAL_TEAMS_AS", "");
    expect(trialSendsToTeams()).toBe(false);
    expect(trialNotice()).not.toContain("Teams");
    expect(trialNotice()).toContain("相談室には届かない");
  });

  it("送る人がいても、Teams を止めていれば書かない", () => {
    vi.stubEnv("KOEKATA_ACCESS_CODE", "123456");
    vi.stubEnv("KOEKATA_TRIAL_TEAMS_AS", "aoki");
    vi.stubEnv("KOEKATA_TEAMS", "off");
    expect(trialNotice()).not.toContain("Teams");
  });
});

describe("注意カードの感想の誘い（0-2h (4b)）", () => {
  it("生徒にはくだけた言い方、先生にはです・ます調で、アイコンの場所を1つ持つ", () => {
    vi.stubEnv("KOEKATA_ACCESS_CODE", "123456");
    vi.stubEnv("KOEKATA_TRIAL_AUDIENCE", "student");
    const student = trialFeedbackHint() ?? "";
    expect(student).toContain("右上の");
    expect(student).toMatch(/よ。$/);
    expect(student.split(FEEDBACK_ICON_SLOT)).toHaveLength(2);
    vi.stubEnv("KOEKATA_TRIAL_AUDIENCE", "teacher");
    const teacher = trialFeedbackHint() ?? "";
    expect(teacher).toMatch(/ます。$/);
    expect(teacher).toContain("ください");
    expect(teacher.split(FEEDBACK_ICON_SLOT)).toHaveLength(2);
  });

  it("審査員用（感想を集めない）と本番では出さない", () => {
    vi.stubEnv("KOEKATA_ACCESS_CODE", "123456");
    vi.stubEnv("KOEKATA_FEEDBACK", "off");
    expect(trialFeedbackHint()).toBeNull();
    vi.stubEnv("KOEKATA_ACCESS_CODE", "");
    vi.stubEnv("KOEKATA_FEEDBACK", "");
    expect(trialFeedbackHint()).toBeNull();
  });
});
