import { redirect } from "next/navigation";

/** ログは「履歴と設定」の「話の履歴」にまとめた。 */
export default function LogPage() {
  redirect("/me?open=talk");
}
