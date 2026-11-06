import { afterEach, describe, expect, it, vi } from "vitest";
import { limitClaude, takeCall } from "./limit";
import type { ClaudeClient } from "./types";
import { keepsSpokenWords, onlyStudentsSelectable, trialAudience, trialTeamsSender } from "../trial";

const client = (text: string): ClaudeClient => ({ mode: "real", complete: async () => ({ text, refused: false }) });
const request = { task: "converse" as const, system: "", messages: [], maxTokens: 10 };

describe("試用の回数の上限", () => {
  it("1時間の上限を超えたら台本で答え、1時間たてば戻る", async () => {
    const log: number[] = [];
    let now = 0;
    const limited = limitClaude(client("本物"), client("台本"), 2, () => now, log);
    expect((await limited.complete(request)).text).toBe("本物");
    expect((await limited.complete(request)).text).toBe("本物");
    expect((await limited.complete(request)).text).toBe("台本");
    now = 60 * 60 * 1000 + 1;
    expect((await limited.complete(request)).text).toBe("本物");
  });

  it("流す呼び出しも同じ数え方で、超えたら台本の答えをまとめて渡す", async () => {
    const log: number[] = [];
    const real: ClaudeClient = {
      ...client("本物"),
      stream: async (_request, onText) => {
        onText("本");
        onText("物");
        return { text: "本物", refused: false };
      },
    };
    const limited = limitClaude(real, client("台本"), 1, () => 0, log);
    const chunks: string[] = [];
    expect((await limited.stream!(request, (chunk) => chunks.push(chunk))).text).toBe("本物");
    expect(chunks).toEqual(["本", "物"]);
    const later: string[] = [];
    expect((await limited.stream!(request, (chunk) => later.push(chunk))).text).toBe("台本");
    expect(later).toEqual(["台本"]);
    expect(log).toHaveLength(1);
  });

  it("数えるのは時刻だけ", () => {
    const log: number[] = [];
    expect(takeCall(5, 1, log)).toBe(true);
    expect(takeCall(6, 1, log)).toBe(false);
    expect(log).toEqual([5]);
  });
});

describe("試用で触る人", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("試用でなければ制限しない", () => {
    vi.stubEnv("KOEKATA_ACCESS_CODE", "");
    expect(trialAudience()).toBeNull();
    expect(onlyStudentsSelectable()).toBe(false);
    expect(keepsSpokenWords()).toBe(true);
    expect(trialTeamsSender()).toBeNull();
  });

  it("生徒用（指定なしも）は生徒だけを選べ、話した言葉を残さない", () => {
    vi.stubEnv("KOEKATA_ACCESS_CODE", "x");
    expect(trialAudience()).toBe("student");
    expect(onlyStudentsSelectable()).toBe(true);
    expect(keepsSpokenWords()).toBe(false);
  });

  it("先生用は先生も選べ、覚えさせられる", () => {
    vi.stubEnv("KOEKATA_ACCESS_CODE", "x");
    vi.stubEnv("KOEKATA_TRIAL_AUDIENCE", "teacher");
    expect(onlyStudentsSelectable()).toBe(false);
    expect(keepsSpokenWords()).toBe(true);
  });

  it("Teams へ送る人は、試用で指定したときだけ", () => {
    vi.stubEnv("KOEKATA_TRIAL_TEAMS_AS", "saeki");
    vi.stubEnv("KOEKATA_ACCESS_CODE", "");
    expect(trialTeamsSender()).toBeNull();
    vi.stubEnv("KOEKATA_ACCESS_CODE", "x");
    expect(trialTeamsSender()).toBe("saeki");
  });
});
