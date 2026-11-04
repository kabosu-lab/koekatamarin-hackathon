import type { DatabaseSync } from "node:sqlite";
import { createDummyTeams } from "./dummy-teams";
import type { PostDestination } from "./types";

/**
 * 画面とアプリの処理が使う投稿先。提出版は Teams 風のダミー。
 * 投稿先を差し替えるときは、ここだけを変える（`docs/multi-school.md`）。
 */
export function getDestination(db: DatabaseSync): PostDestination {
  return createDummyTeams(db);
}
