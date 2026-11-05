import type { DatabaseSync } from "node:sqlite";
import { createDummyTeams } from "./dummy-teams";
import { withTeamsBridge } from "./teams-bridge";
import type { PostDestination } from "./types";

/**
 * 画面とアプリの処理が使う投稿先。こえかたの DB を正とし、設定があれば本物の Teams にもつなぐ。
 * 投稿先を差し替えるときは、ここだけを変える（`docs/multi-school.md`）。
 */
export function getDestination(db: DatabaseSync): PostDestination {
  return withTeamsBridge(createDummyTeams(db), db);
}
