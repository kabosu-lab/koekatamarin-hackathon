/* 通し版の音と、作った過程の数字を用意する。数字はリポジトリから数える */
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync, execSync } from "node:child_process";
import { mix, pad, piano, reverb, save } from "./audio-lib.mjs";
import { hasSay, noteSkippedVoice } from "./asset-tools.mjs";

const pub = new URL("../public/", import.meta.url);
const FULL = JSON.parse(readFileSync(new URL("../src/candidates/story.json", import.meta.url), "utf8"));
const root = new URL("../../", import.meta.url).pathname;

/* 15秒より後に流す、薄い音楽（冒頭は候補 A の音） */
const SEC = 178, m = mix(SEC);
const chords = [[48, 55, 64], [53, 60, 69], [45, 52, 60], [55, 62, 67]];
for (let t = 15, i = 0; t < SEC; t += 8, i++) {
  const c = chords[i % 4];
  pad(m, t, c, 8.6, .014);
  piano(m, t + .1, c[0] + 12, .09);
  piano(m, t + 2.1, c[2] + 12, .07, { pan: .3 });
  if (i % 2) piano(m, t + 4.2, c[1] + 24, .05, { pan: -.3 });
}
reverb(m, .3); save(m, "music-full.wav", .34);

if (!hasSay()) noteSkippedVoice(FULL.voice.length);
else for (const v of FULL.voice) {
  const aiff = new URL(`${v.id}.aiff`, pub).pathname, out = new URL(`${v.id}.wav`, pub).pathname;
  execFileSync("say", ["-v", "Kyoko", "-r", "190", "-o", aiff, v.text]);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", aiff, "-ar", "44100", "-ac", "2", out]);
  rmSync(aiff);
  const len = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out]).toString());
  console.log(`${v.id} ${len.toFixed(2)}秒 ${(v.at / 30).toFixed(1)}〜${(v.at / 30 + len).toFixed(1)}`);
}

const sh = c => execSync(c, { cwd: root }).toString().trim();
const facts = {
  commits: Number(sh("git rev-list --count HEAD")),
  tests: Number(sh(`git grep -hE "^[[:space:]]*(it|test)\\(" HEAD -- src e2e | wc -l`)),
  reviews: Number(sh("git ls-tree -r --name-only HEAD reviews | wc -l")),
  recent: sh(`git log --format=%s | grep "追加$" | grep -vE "Codex|動画|勤務|学校" | head -9`).split("\n"),
};
writeFileSync(new URL("../src/candidates/repo-facts.json", import.meta.url), JSON.stringify(facts, null, 2) + "\n");
console.log(facts);
