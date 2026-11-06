/**
 * 最初の約束のカードは画面の真ん中に出て操作をふさぐので、ふだんのテストでは読んだことにしておく。
 * カードそのものは safety.spec.ts と demo.spec.ts で確かめる。
 */
export const PROMISE_SEEN = ["saeki", "ogawara", "kawamura", "noda", "shiraishi", "fujimoto", "aoki", "kinoshita", "nakamura"].map((id) => ({
  name: `koekata_promise_${id}`,
  value: "1",
  domain: "127.0.0.1",
  path: "/",
  expires: -1,
  httpOnly: false,
  secure: false,
  sameSite: "Lax" as const,
})).concat([
  // その日はじめての「みんな」で出る今日の3人のモーダルも、ふだんのテストでは見たことにする（モーダルそのものは minna.spec.ts で確かめる）
  { name: "koekata_today_seen", value: "1", domain: "127.0.0.1", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" as const },
]);
