import { Talk } from "./Talk";

export default function HomePage() {
  return (
    <main className="home">
      <header>
        <h1>コエカタ</h1>
        <p>一人で抱えない。</p>
      </header>
      <Talk />
    </main>
  );
}
