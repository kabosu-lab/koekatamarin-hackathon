import { describe, expect, it, vi } from "vitest";
import { readLimitedBody } from "./limited-body";

const CHUNK = new Uint8Array(1024);

/** Content-Length のない送信。読まれた分だけ数え、途中で止められたかを確かめる。 */
function streamed(chunks: number) {
  const seen = { pulled: 0, cancelled: false };
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (seen.pulled >= chunks) return controller.close();
      seen.pulled += 1;
      controller.enqueue(CHUNK);
    },
    cancel() {
      seen.cancelled = true;
    },
  });
  const request = new Request("http://test/", { method: "POST", body, duplex: "half" } as RequestInit);
  return { request, seen };
}

describe("上限つきの読み込み", () => {
  it("上限までなら全部読める", async () => {
    const { request } = streamed(3);
    expect((await readLimitedBody(request, 3 * 1024))?.length).toBe(3 * 1024);
  });

  it("Content-Length がなくても、上限を超えた時点で読むのをやめる", async () => {
    const { request, seen } = streamed(1000);
    expect(await readLimitedBody(request, 2 * 1024)).toBeNull();
    expect(seen.cancelled).toBe(true);
    expect(seen.pulled).toBeLessThan(10);
  });

  it("Content-Length が上限を超えていれば、本体を読まない", async () => {
    const { request, seen } = streamed(1);
    const declared = new Request(request, { headers: { "content-length": "99999" } });
    expect(await readLimitedBody(declared, 1024)).toBeNull();
    expect(seen.pulled).toBeLessThanOrEqual(1);
  });

  it("本体がなければ空で返す", async () => {
    expect((await readLimitedBody(new Request("http://test/", { method: "POST" }), 10))?.length).toBe(0);
  });
});

describe("添付の入口", () => {
  it("Content-Length のない過大な送信を 413 で断る", async () => {
    vi.doMock("@/lib/current-person", () => ({ getViewer: async () => ({ viewer: { id: "saeki" } }) }));
    vi.doMock("@/lib/db", () => ({ getDatabase: () => { throw new Error("読み切る前に DB へ進まない"); } }));
    const { POST } = await import("@/app/api/attachments/route");
    const { MAX_IMAGE_BYTES } = await import("./attachment");
    const { request, seen } = streamed(Math.ceil((MAX_IMAGE_BYTES * 3) / 1024));
    const response = await POST(request);
    expect(response.status).toBe(413);
    expect(seen.cancelled).toBe(true);
    expect(seen.pulled * 1024).toBeLessThan(MAX_IMAGE_BYTES * 2);
  });
});
