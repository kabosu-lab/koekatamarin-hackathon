import type { ClaudeClient } from "./types";

const HOUR_MS = 60 * 60 * 1000;
/** 先生数人が試す昼休みに足りて、料金が膨らまない数 */
export const DEFAULT_CALLS_PER_HOUR = 200;

/** 呼んだ時刻。サーバーの中だけに置き、誰が呼んだかは持たない。 */
const calls: number[] = [];

/** 1時間の回数に空きがあれば数えて true を返す。 */
export function takeCall(now: number, perHour: number, log: number[] = calls): boolean {
  while (log.length > 0 && log[0] <= now - HOUR_MS) log.shift();
  if (log.length >= perHour) return false;
  log.push(now);
  return true;
}

/** 回数を超えたら、本物の代わりに台本で答える。画面は止めない。 */
export function limitClaude(
  real: ClaudeClient,
  fallback: ClaudeClient,
  perHour: number = DEFAULT_CALLS_PER_HOUR,
  now: () => number = Date.now,
  log: number[] = calls,
): ClaudeClient {
  return {
    mode: "real",
    complete(request) {
      return takeCall(now(), perHour, log) ? real.complete(request) : fallback.complete(request);
    },
    // 流す呼び出しも同じ数え方。超えたら台本で答える（台本は流せないので、まとめて渡す）
    async stream(request, onText) {
      const allowed = takeCall(now(), perHour, log);
      if (allowed && real.stream) return real.stream(request, onText);
      const response = await (allowed ? real : fallback).complete(request);
      onText(response.text);
      return response;
    },
  };
}
