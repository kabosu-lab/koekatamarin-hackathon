import { redirect } from "next/navigation";

/** 「一緒に勉強する」は自習室と同じ機能なので、自習室の1画面にまとめた（0-1u (6)）。前の入口から来ても自習室へ送る。 */
export default function StudyPage() {
  redirect("/study/room");
}
