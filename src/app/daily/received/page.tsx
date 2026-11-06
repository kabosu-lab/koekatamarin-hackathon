import { redirect } from "next/navigation";

/** 届いた日報と日記は、受信箱の中の段にまとめた（0-2b）。入口を1つにするため、ここからは受信箱へ送る。 */
export default function ReceivedPage() {
  redirect("/inbox#received");
}
