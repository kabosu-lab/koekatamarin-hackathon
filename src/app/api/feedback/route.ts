import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { getDatabase } from "@/lib/db";
import { createFeedbackLimiter, parseFeedback, saveFeedback } from "@/lib/feedback";
import { collectsFeedback } from "@/lib/trial";

const DEVICE_COOKIE = "koekata_feedback_device";
const MAX_REQUEST_LENGTH = 16_000;
const allow = createFeedbackLimiter();

/** 試用の改善点を受け取る。合言葉は入口（src/proxy.ts）で確かめ済み。人物は読まない。 */
export async function POST(request: Request) {
  // 試用で感想を集めているときだけ（審査員用・本番・みんな用では受け取らない）
  if (!collectsFeedback()) return Response.json({ error: "見つかりません" }, { status: 404 });

  const store = await cookies();
  const device = store.get(DEVICE_COOKIE)?.value ?? null;
  // 端末の印は連打を数えるためだけのもの。保存せず、誰かとも結びつけない
  if (!device) store.set(DEVICE_COOKIE, randomUUID(), { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 });
  if (!allow(device, Date.now())) return Response.json({ error: "少し待ってから送ってください" }, { status: 429 });

  const raw = await request.text().catch(() => "");
  if (raw.length > MAX_REQUEST_LENGTH) return Response.json({ error: "長すぎます" }, { status: 413 });
  let input: unknown = null;
  try {
    input = JSON.parse(raw);
  } catch {
    // 下で 400 にする
  }
  const parsed = parseFeedback(input);
  if (!parsed) return Response.json({ error: "種類を選ぶか、本文を書いてください。本文は1000字までです" }, { status: 400 });

  saveFeedback(getDatabase(), parsed, new Date());
  return Response.json({ ok: true });
}
