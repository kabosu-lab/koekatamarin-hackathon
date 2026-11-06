import type { Person } from "@/lib/people";
import { switchPerson } from "./person-actions";

/**
 * 試すときに、誰として使うかを切り替える。「履歴と設定」の「設定」のいちばん下にだけ置く。
 * 実際の学校ではログインに置き換える。「デモ用」の言葉は古い形の目印なので使わない（0-2i(1)）。
 */
export function PersonSwitcher({ viewerId, people }: { viewerId: string; people: Person[] }) {
  return (
    <form action={switchPerson} className="switcher demo-switcher">
      <label>
        試す人を切り替える
        <select name="personId" defaultValue={viewerId} key={viewerId}>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}（{p.label}）
            </option>
          ))}
        </select>
      </label>
      <button type="submit">切り替え</button>
    </form>
  );
}
