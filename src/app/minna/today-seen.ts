/**
 * 今日の3人のモーダルを、その日に自動で出したことの印（0-1x）。値は見ず、あるかないかだけ。日本時間の0時で消える。
 * サーバー（page.tsx）とブラウザ（TodayModal.tsx）の両方で読むので、"use client" の外に置く。
 */
export const TODAY_SEEN_COOKIE = "koekata_today_seen";
