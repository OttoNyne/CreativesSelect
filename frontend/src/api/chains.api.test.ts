import { afterEach, describe, expect, it, vi } from "vitest";
import { chainsApi } from "./chains.api";
import { ApiError } from "./client";

afterEach(() => vi.unstubAllGlobals());

function mockFetch(answer: { ok?: boolean; status?: number; body?: unknown } = {}) {
  const fn = vi.fn().mockResolvedValue({ ok: answer.ok ?? true, status: answer.status ?? 200, json: async () => answer.body ?? {} });
  vi.stubGlobal("fetch", fn);
  return fn;
}
const calls = (fn: ReturnType<typeof mockFetch>) => fn.mock.calls.map(([url, init]) => `${init?.method ?? "GET"} ${String(url).replace(/^.*\/api/, "")}`);
const png = (text: string) => new Blob([text], { type: "image/png" });

describe("chainsApi", () => {
  it("asks for the board, the finished chains (a page at a time), your own and one chain", async () => {
    const fetchFn = mockFetch();
    await chainsApi.open();
    await chainsApi.open(3);
    await chainsApi.complete(2);
    await chainsApi.mine();
    await chainsApi.get("a b");
    expect(calls(fetchFn)).toEqual(["GET /chains/open?page=1", "GET /chains/open?page=3", "GET /chains/complete?page=2", "GET /chains/mine", "GET /chains/a%20b"]);
  });

  it("takes a part, gives it back and takes a chain back", async () => {
    const fetchFn = mockFetch({ status: 200, body: { chain: {}, claimedUntil: "x", minutes: 30 } });
    await chainsApi.claim("c1");
    await chainsApi.release("c1");
    await chainsApi.remove("c1");
    expect(calls(fetchFn)).toEqual(["POST /chains/c1/claim", "DELETE /chains/c1/claim", "DELETE /chains/c1"]);
  });

  it("starts a chain with a form: the idea, the picture and its strip", async () => {
    const fetchFn = mockFetch({ status: 201, body: { chain: { id: "c1" } } });
    await chainsApi.start(png("whole"), png("strip"), "A tall cat");
    const [url, init] = fetchFn.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/chains$/);
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    const form = init.body as FormData;
    expect(form.get("prompt")).toBe("A tall cat");
    expect((form.get("section") as File).name).toBe("section.png");
    expect((form.get("edge") as File).name).toBe("edge.png");
  });

  it("sends the last part without a strip, and without an idea", async () => {
    const fetchFn = mockFetch({ status: 201, body: { chain: { id: "c1" } } });
    await chainsApi.addPart("c1", png("whole"), null);
    const form = fetchFn.mock.calls[0][1].body as FormData;
    expect(String(fetchFn.mock.calls[0][0])).toMatch(/\/api\/chains\/c1\/sections$/);
    expect(form.has("section")).toBe(true);
    expect(form.has("edge")).toBe(false);
    expect(form.has("prompt")).toBe(false);
  });

  it("turns a refusal into an error with the server's words, in the language of the page", async () => {
    mockFetch({ ok: false, status: 409, body: { error: "That chain is finished" } });
    const error = await chainsApi.addPart("c1", png("x"), null).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(409);
    expect(error.message).toBe("That chain is finished");
  });
});
