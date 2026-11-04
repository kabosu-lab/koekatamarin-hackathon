import type { Person } from "@/lib/people";
import { switchPerson } from "./person-actions";

/** デモ用。全画面の一番下の同じ場所にだけ置く。実際の学校ではログインに置き換える。 */
export function PersonSwitcher({ viewerId, people }: { viewerId: string; people: Person[] }) {
  return (
    <form action={switchPerson} className="switcher demo-switcher">
      <label>
        デモ用：使う人
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
