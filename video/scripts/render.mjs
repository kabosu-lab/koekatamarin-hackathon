/* 動画を書き出す。使うブラウザは KOEKATA_BROWSER_EXECUTABLE で渡せる。未指定の Mac では Google Chrome を使う
   使い方: node scripts/render.mjs [コンポジション] [出力先] [remotion に渡す追加の指定] */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const MAC_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = process.env.KOEKATA_BROWSER_EXECUTABLE || (process.platform === "darwin" ? MAC_CHROME : null);
if (!browser) {
  console.error("ブラウザの場所が分かりません。環境変数 KOEKATA_BROWSER_EXECUTABLE に Chrome の実行ファイルの場所を指定してください。");
  process.exit(1);
}

const [composition = "Trial", output = "out/koekata-trial.mp4", ...extra] = process.argv.slice(2);
const cli = fileURLToPath(new URL("../node_modules/@remotion/cli/remotion-cli.js", import.meta.url));
const result = spawnSync(
  process.execPath,
  [cli, "render", "src/index.jsx", composition, output, "--codec=h264", "--crf=18", `--browser-executable=${browser}`, ...extra],
  { cwd: fileURLToPath(new URL("../", import.meta.url)), stdio: "inherit" },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
