import { afterEach, describe, expect, it, vi } from "vitest";
import { exploreApi } from "./explore.api";

afterEach(() => vi.unstubAllGlobals());

describe("exploreApi", () => {
  it("asks for posts or pieces, adding the topic and the cursor only when there are some", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchFn);
    await exploreApi.list({ type: "posts" });
    await exploreApi.list({ type: "pieces", tag: "ceramics", before: "abc123" });
    await exploreApi.list({ type: "posts", tag: "café" });
    await exploreApi.trending();
    expect(fetchFn.mock.calls.map(([url]) => String(url).replace(/^.*\/api/, ""))).toEqual([
      "/explore?type=posts",
      "/explore?type=pieces&tag=ceramics&before=abc123",
      "/explore?type=posts&tag=caf%C3%A9",
      "/explore/trending",
    ]);
  });
});
