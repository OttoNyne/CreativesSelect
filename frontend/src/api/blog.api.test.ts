import { afterEach, describe, expect, it, vi } from "vitest";
import { blogApi } from "./blog.api";

function mockFetch() {
  const fn = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
  vi.stubGlobal("fetch", fn);
  return fn;
}
afterEach(() => vi.unstubAllGlobals());

describe("blogApi: comments", () => {
  it("asks for a page after a comment, writes, changes, takes a picture off and removes by the right addresses", async () => {
    const fetchFn = mockFetch();
    await blogApi.comments("e1");
    await blogApi.comments("e1", "c5");
    await blogApi.addComment("e1", "Nice");
    await blogApi.addComment("e1", "", "https://x/a.png");
    await blogApi.updateComment("c5", "Nicer");
    await blogApi.removeCommentPicture("c5");
    await blogApi.removeComment("c5");
    const calls = fetchFn.mock.calls.map(([url, init]) => `${init?.method ?? "GET"} ${String(url).replace(/^.*\/api/, "")}`);
    expect(calls).toEqual(["GET /blog/e1/comments", "GET /blog/e1/comments?after=c5", "POST /blog/e1/comments", "POST /blog/e1/comments", "PATCH /blog/comments/c5", "PATCH /blog/comments/c5", "DELETE /blog/comments/c5"]);
    const body = (i: number) => JSON.parse(fetchFn.mock.calls[i][1].body);
    expect(body(2)).toEqual({ content: "Nice" });
    expect(body(3)).toEqual({ content: "", imageUrl: "https://x/a.png" });
    expect(body(5)).toEqual({ imageUrl: null });
  });
});
