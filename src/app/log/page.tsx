import { redirect } from "next/navigation";

/** ログは「履歴と設定」にまとめた。 */
export default function LogPage() {
  redirect("/me");
}
