import type { Person } from "@/lib/people";
import { switchPerson } from "./person-actions";

export function PersonSwitcher({ viewerId, people }: { viewerId: string; people: Person[] }) {
  return (
    <form action={switchPerson} className="switcher">
      <label>
        使う人
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
