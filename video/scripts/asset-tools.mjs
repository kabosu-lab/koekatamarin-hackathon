/* 素材づくりの共通処理。Mac 以外でも、何が足りないかが分かるようにする */
import { copyFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/* 仮の声は Mac の say で作る。say がない環境では作らない */
export function hasSay() {
  try {
    execFileSync("say", ["-v", "?"], { stdio: "ignore" });
    return true;
  } catch (error) {
    return error.code !== "ENOENT";
  }
}

export function noteSkippedVoice(count) {
  console.log(`say がないので、仮の声 ${count} 本の生成を飛ばしました。public/ の既存の音声はそのままです。`);
}

/* 絵は公開リポジトリに入れない。なければ、足りないファイルを示して止まる */
export function copyArt(from, to) {
  try {
    copyFileSync(from, to);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    throw new Error(`絵のファイルがありません: ${fileURLToPath(from)}\n.private/art/ に置いてから、もう一度実行してください。`);
  }
}
