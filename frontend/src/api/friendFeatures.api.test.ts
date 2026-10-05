import { afterEach, describe, expect, it, vi } from "vitest";
import { friendsApi } from "./friends.api";

function mockFetch() {
  const fn = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
  vi.stubGlobal("fetch", fn);
  return fn;
}
afterEach(() => vi.unstubAllGlobals());

describe("friendsApi: mutual friends and suggestions", () => {
  it("asks for the right addresses", async () => {
    const fetchFn = mockFetch();
    await friendsApi.mutual("zoe");
    await friendsApi.suggestions();
    await friendsApi.dismissSuggestion("kai");
    const calls = fetchFn.mock.calls.map(([url, init]) => `${init?.method ?? "GET"} ${String(url).replace(/^.*\/api/, "")}`);
    expect(calls).toEqual(["GET /friends/mutual/zoe", "GET /friends/suggestions", "POST /friends/suggestions/dismiss/kai"]);
  });
});
