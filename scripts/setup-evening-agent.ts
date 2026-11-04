// 夕方のまとめの係を1回だけ作る。ID は Git に入らない data/evening-agent.json に残し、画面やログには出さない。
// 作り直しても二重に作らない（同じ名前のものを探して使い、指示が変わっていれば更新する）。
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import {
  EVENING_AGENT_NAME,
  EVENING_ENVIRONMENT_NAME,
  EVENING_MODEL,
  eveningConfigPath,
  eveningSystemPrompt,
} from "../src/lib/claude/evening-agent";

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(".env に ANTHROPIC_API_KEY を入れてください。");
    process.exit(1);
  }
  const client = new Anthropic();

  let environmentId: string | undefined;
  for await (const environment of client.beta.environments.list()) {
    if (environment.name === EVENING_ENVIRONMENT_NAME && !environment.archived_at) {
      environmentId = environment.id;
      break;
    }
  }
  if (environmentId) {
    console.log("環境：前に作ったものを使います");
  } else {
    // 道具を持たないので通信先も開けない
    const environment = await client.beta.environments.create({
      name: EVENING_ENVIRONMENT_NAME,
      config: { type: "cloud", networking: { type: "limited" } },
    });
    environmentId = environment.id;
    console.log("環境：作りました");
  }

  let agentId: string | undefined;
  for await (const agent of client.beta.agents.list()) {
    if (agent.name !== EVENING_AGENT_NAME || agent.archived_at) continue;
    agentId = agent.id;
    if (agent.system === eveningSystemPrompt) {
      console.log("係：前に作ったものを使います");
    } else {
      await client.beta.agents.update(agent.id, { version: agent.version, system: eveningSystemPrompt });
      console.log("係：指示を更新しました");
    }
    break;
  }
  if (!agentId) {
    const agent = await client.beta.agents.create({
      name: EVENING_AGENT_NAME,
      model: EVENING_MODEL,
      system: eveningSystemPrompt,
      // ネットの検索もコードの実行も持たせない。渡した材料だけでまとめる
      tools: [],
    });
    agentId = agent.id;
    console.log("係：作りました");
  }

  const path = eveningConfigPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ agentId, environmentId }, null, 2)}\n`, { mode: 0o600 });
  console.log("手元の設定に残しました（Git には入りません）");
}

main().catch((error: unknown) => {
  console.error("作れませんでした", error instanceof Error ? `${error.name}: ${error.message}` : "unknown");
  process.exit(1);
});
