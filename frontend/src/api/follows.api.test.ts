import { afterEach, describe, expect, it, vi } from "vitest";
import { followsApi } from "./follows.api";

afterEach(() => vi.unstubAllGlobals());

describe("followsApi", () => {
  it("follows, unfollows and lists, one page at a time", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchFn);
    await followsApi.follow("sam");
    await followsApi.unfollow("a b");
    await followsApi.following();
    await followsApi.followers(3);
    expect(fetchFn.mock.calls.map(([url, init]) => `${init?.method ?? "GET"} ${String(url).replace(/^.*\/api/, "")}`)).toEqual([
      "POST /follows/sam",
      "DELETE /follows/a%20b",
      "GET /follows/following",
      "GET /follows/followers?page=3",
    ]);
  });
});
