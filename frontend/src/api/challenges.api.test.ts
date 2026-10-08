import { afterEach, describe, expect, it, vi } from "vitest";
import { challengesApi } from "./challenges.api";

afterEach(() => vi.unstubAllGlobals());

function mockFetch() {
  const fn = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
  vi.stubGlobal("fetch", fn);
  return fn;
}
const calls = (fn: ReturnType<typeof mockFetch>) => fn.mock.calls.map(([url, init]) => `${init?.method ?? "GET"} ${String(url).replace(/^.*\/api/, "")}`);

describe("challengesApi", () => {
  it("asks for this week in the language of the page", async () => {
    const fetchFn = mockFetch();
    await challengesApi.current("es");
    expect(calls(fetchFn)).toEqual(["GET /challenges/current?lang=es"]);
  });

  it("asks for a week's gallery, adding the order, page and size only when they matter", async () => {
    const fetchFn = mockFetch();
    await challengesApi.entries("2026-W41", { lang: "en" });
    await challengesApi.entries("2026-W41", { lang: "ar", sort: "top", page: 3 });
    await challengesApi.entries("2026-W40", { lang: "en", sort: "new", page: 1, limit: 3 });
    expect(calls(fetchFn)).toEqual([
      "GET /challenges/2026-W41/entries?lang=en",
      "GET /challenges/2026-W41/entries?lang=ar&sort=top&page=3",
      "GET /challenges/2026-W40/entries?lang=en&limit=3",
    ]);
  });

  it("enters a piece and withdraws it", async () => {
    const fetchFn = mockFetch();
    await challengesApi.enter("m1");
    await challengesApi.withdraw();
    expect(calls(fetchFn)).toEqual(["POST /challenges/current/entry", "DELETE /challenges/current/entry"]);
    expect(JSON.parse(String(fetchFn.mock.calls[0][1].body))).toEqual({ itemId: "m1" });
  });
});
