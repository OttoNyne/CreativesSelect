import { afterEach, describe, expect, it, vi } from "vitest";
import { ABOUT_FIELDS, MAX_ABOUT, MAX_LOCATION, aboutApi } from "./about.api";

function mockFetch() {
  const fn = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
  vi.stubGlobal("fetch", fn);
  return fn;
}
afterEach(() => vi.unstubAllGlobals());

describe("aboutApi", () => {
  it("has the limits the server has", () => {
    expect(ABOUT_FIELDS).toEqual(["interests", "music", "movies", "books", "meet"]);
    expect(MAX_ABOUT).toBe(300);
    expect(MAX_LOCATION).toBe(60);
  });

  it("reads someone's by username and saves your own", async () => {
    const fetchFn = mockFetch();
    await aboutApi.get("zoe");
    await aboutApi.save({ interests: "x", birthday: null });
    const calls = fetchFn.mock.calls.map(([url, init]) => `${init?.method ?? "GET"} ${String(url).replace(/^.*\/api/, "")}`);
    expect(calls).toEqual(["GET /about/zoe", "PUT /about/me"]);
    expect(JSON.parse(fetchFn.mock.calls[1][1].body)).toEqual({ interests: "x", birthday: null });
  });
});
