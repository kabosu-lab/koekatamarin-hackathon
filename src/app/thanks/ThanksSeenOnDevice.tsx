"use client";

import { useEffect } from "react";
import { markThanksSeenOnDevice, thanksDeviceCookie } from "@/lib/thanks-kind";

/**
 * 「ありがとう」のタイルを開いた＝この端末で見た。話す画面の封筒の知らせを、この端末では出さない。
 * 最初の読み込みでは HTML の中の小さなスクリプトで、すぐに印を付ける（画面がまだ動き出す前に次の画面へ移っても残る）。
 * 画面の中の移動で開いたときは、描いたあとに付ける。
 */
export function ThanksSeenOnDevice({ viewerId, at }: { viewerId: string; at: string }) {
  useEffect(() => markThanksSeenOnDevice(viewerId, at), [viewerId, at]);
  const name = thanksDeviceCookie(viewerId);
  const script = `(function(){try{var n=${JSON.stringify(name)},a=${JSON.stringify(at)},m=document.cookie.split("; ").find(function(p){return p.indexOf(n+"=")===0}),v=m?decodeURIComponent(m.slice(n.length+1)):"";if(v<a)document.cookie=n+"="+encodeURIComponent(a)+"; path=/; max-age=34560000; samesite=lax"}catch(e){}})()`;
  return <script dangerouslySetInnerHTML={{ __html: script }} suppressHydrationWarning />;
}
