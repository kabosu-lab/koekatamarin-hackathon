import { accessCookieHeader, codeMatches } from "@/lib/access";
import { accessCode, TRIAL_NOTICE } from "@/lib/trial";

export const dynamic = "force-dynamic";

const goHome = (extra: Record<string, string> = {}) =>
  new Response(null, { status: 303, headers: { Location: "/", "Cache-Control": "no-store", ...extra } });

/** 人物やデータを読むレイアウトを通さないよう、JavaScript も使わない1枚の画面として返す。 */
function page(problem: string | null, status: number, numeric = false) {
  const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>合言葉｜こえかた</title>
<style>
  body { margin: 0; min-height: 100dvh; display: grid; place-items: center; padding: 16px; box-sizing: border-box; background: #f6f5f1; color: #1f2933; font-family: system-ui, sans-serif; }
  main { width: 100%; max-width: 360px; }
  h1 { font-size: 1.5rem; margin: 0 0 16px; }
  label { display: block; font-weight: 700; margin-bottom: 8px; }
  input, button { width: 100%; box-sizing: border-box; min-height: 48px; font-size: 1rem; border-radius: 10px; }
  input { padding: 0 12px; border: 1px solid #66717c; background: #fff; color: inherit; }
  button { margin-top: 12px; border: 0; background: #1f2933; color: #fff; font-weight: 700; }
  .problem { color: #b42318; font-weight: 700; }
  small { display: block; margin-top: 16px; line-height: 1.6; color: #4b5563; }
</style>
</head>
<body>
<main>
  <h1>こえかた</h1>
  <form method="post" action="/access">
    <label for="code">合言葉</label>
    <input id="code" name="code" type="password" autocomplete="off" required autofocus${numeric ? ' inputmode="numeric" pattern="[0-9]*"' : ""}>
    ${problem ? `<p class="problem" role="alert">${problem}</p>` : ""}
    <button type="submit">入る</button>
  </form>
  <small>${TRIAL_NOTICE}</small>
</main>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** 数字だけの合言葉なら、スマホで数字のキーボードを出す */
const isDigits = (code: string) => /^\d+$/.test(code);

export function GET() {
  const code = accessCode();
  return code === null ? goHome() : page(null, 200, isDigits(code));
}

export async function POST(request: Request) {
  const code = accessCode();
  if (code === null) return goHome();
  const form = await request.formData().catch(() => null);
  if (!codeMatches(form?.get("code"), code)) return page("合言葉が違います。", 401, isDigits(code));
  return goHome({ "Set-Cookie": accessCookieHeader(code) });
}
