import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_TRACKS, MAX_UPLOADS, tracksApi } from "./tracks.api";

function mockFetch() {
  const fn = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
  vi.stubGlobal("fetch", fn);
  return fn;
}
afterEach(() => vi.unstubAllGlobals());

describe("tracksApi", () => {
  it("has the limits the server has", () => {
    expect(MAX_TRACKS).toBe(20);
    expect(MAX_UPLOADS).toBe(5);
  });

  it("changes a track and reports a play by the right addresses", async () => {
    const fetchFn = mockFetch();
    await tracksApi.update("t1", { title: "New", profileSong: true });
    await tracksApi.played("t1");
    const calls = fetchFn.mock.calls.map(([url, init]) => `${init?.method ?? "GET"} ${String(url).replace(/^.*\/api/, "")}`);
    expect(calls).toEqual(["PATCH /tracks/t1", "POST /tracks/t1/play"]);
    expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toEqual({ title: "New", profileSong: true });
  });
});
