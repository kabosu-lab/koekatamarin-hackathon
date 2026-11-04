// 生徒からの改善点を Markdown にして .private/ に書き出す。データベースは読むだけで、試用中でも変えない。
//   npm run feedback:list                 .private/feedback.md に書く
//   npm run feedback:list -- 名前.md      .private/ の中の、別の名前に書く
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { feedbackToMarkdown } from "../src/lib/feedback";

const PRIVATE_DIR = resolve(".private");

function outputPath(requested: string | undefined): string {
  const target = resolve(PRIVATE_DIR, requested ?? "feedback.md");
  mkdirSync(dirname(target), { recursive: true });
  const parent = relative(realpathSync(PRIVATE_DIR), realpathSync(dirname(target)));
  if (relative(PRIVATE_DIR, target).startsWith("..") || isAbsolute(parent) || parent.startsWith("..")) {
    throw new Error("書き出せるのは .private/ の中だけです");
  }
  return target;
}

function main() {
  mkdirSync(PRIVATE_DIR, { recursive: true });
  const target = outputPath(process.argv[2]);
  const db = new DatabaseSync(process.env.KOEKATA_DB_PATH ?? "data/koekata.db", { readOnly: true });
  try {
    writeFileSync(target, feedbackToMarkdown(db), { mode: 0o600 });
  } finally {
    db.close();
  }
  console.log(`${relative(process.cwd(), target)} に書き出しました`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message.includes("no such table") ? "まだ改善点の表がありません（新しい版で一度起動すると作られます）" : message);
  process.exit(1);
}
