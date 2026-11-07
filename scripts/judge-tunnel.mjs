// 審査用（scripts/judge.mjs と scripts/judge-watch.mjs）が使う、cloudflared の一時トンネルまわりの決めごと。
// 外のものに触らない関数だけを置き、単体テスト（src/lib/judge-tunnel.test.ts）で確かめる。

/** cloudflared の出力から、一時トンネルの URL を読む。なければ null */
export function parseTunnelUrl(text) {
  // api.trycloudflare.com はトンネルを頼む先で、開く URL ではない
  const found = [...String(text ?? "").matchAll(/https:\/\/([a-z0-9-]+)\.trycloudflare\.com/g)].find((m) => m[1] !== "api");
  return found ? found[0] : null;
}

/** 開き直すトンネル。プロセスが止まっているものだけ（URL が変わると提出フォームの URL が使えなくなるので、動いているものには触らない） */
export function tunnelsToStart(sites, tunnels, isAlive) {
  return sites.filter((site) => !isAlive(tunnels?.[site.name])).map((site) => site.name);
}

/**
 * 見張りの判断。
 * - 手元のサーバーが開けなければ、サーバーを起こし直す
 * - トンネルで出しているとき、cloudflared のプロセスが止まっていれば、そのトンネルだけ開き直す
 * - cloudflared が動いているのに外から開けないときは、知らせるだけで触らない
 * checks は site.name ごとに { local: boolean, tunnelAlive: boolean | null, hasUrl: boolean, outside: boolean | null }
 */
export function watchPlan(sites, checks, expose) {
  const problems = [];
  let restartServers = false;
  const restartTunnels = [];
  for (const site of sites) {
    const check = checks[site.name] ?? {};
    if (!check.local) {
      restartServers = true;
      problems.push(`${site.label}のサーバーが止まっていた`);
    }
    if (expose === "tunnel" && check.tunnelAlive === false) {
      restartTunnels.push(site.name);
      problems.push(`${site.label}のトンネル（cloudflared）が止まっていた`);
    } else if (expose === "tunnel" && check.tunnelAlive && check.hasUrl === false) {
      problems.push(`${site.label}のトンネルは動いているが、URL を読めていない（data/judge-logs を見る）`);
    } else if (check.local && check.outside === false) {
      const hint = expose === "tunnel" ? "cloudflared は動いているので触らない" : "Tailscale Funnel を確かめる";
      problems.push(`${site.label}は手元では動いているが、外から開けない（${hint}）`);
    }
  }
  return { restartServers, restartTunnels, problems };
}

/** URL が変わった場所の名前（知らせに使う。URL そのものは書かない） */
export function changedUrls(sites, before, after) {
  return sites.filter((site) => (before?.[site.name] ?? null) !== (after?.[site.name] ?? null)).map((site) => site.label);
}
