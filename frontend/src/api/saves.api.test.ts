import { afterEach, describe, expect, it, vi } from "vitest";
import { savesApi } from "./saves.api";
import { postsApi } from "./posts.api";

afterEach(() => vi.unstubAllGlobals());

describe("savesApi and sharing", () => {
  it("saves, removes and lists, and shares a post with or without words", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchFn);
    await savesApi.save("posts", "p1");
    await savesApi.unsave("pieces", "a b");
    await savesApi.list("posts");
    await savesApi.list("pieces", "cur1");
    await postsApi.repost("p1", "Look");
    await postsApi.repost("p2");
    expect(fetchFn.mock.calls.map(([url, init]) => `${init?.method ?? "GET"} ${String(url).replace(/^.*\/api/, "")}`)).toEqual([
      "PUT /saves/posts/p1",
      "DELETE /saves/pieces/a%20b",
      "GET /saves?type=posts",
      "GET /saves?type=pieces&before=cur1",
      "POST /posts/p1/repost",
      "POST /posts/p2/repost",
    ]);
    expect(JSON.parse(String(fetchFn.mock.calls[4][1].body))).toEqual({ content: "Look" });
    expect(JSON.parse(String(fetchFn.mock.calls[5][1].body))).toEqual({});
  });
});
