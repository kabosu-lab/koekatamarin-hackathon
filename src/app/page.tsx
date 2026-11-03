import { getViewer } from "@/lib/current-person";
import { PersonSwitcher } from "./PersonSwitcher";
import { Talk } from "./Talk";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { viewer, people } = await getViewer();
  return (
    <main className="home">
      <header>
        <h1>コエカタ</h1>
        <p>一人で抱えない。</p>
        <PersonSwitcher viewerId={viewer.id} people={people} />
      </header>
      {/* Claude との話は本人だけのもの。人物を切り替えたら会話を持ち越さない */}
      <Talk key={viewer.id} viewer={{ name: viewer.name, label: viewer.label }} />
    </main>
  );
}
