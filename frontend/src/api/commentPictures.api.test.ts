import { afterEach, describe, expect, it, vi } from "vitest";
import { postsApi } from "./posts.api";
import { profilesApi } from "./profiles.api";
import { mediaApi } from "./media.api";

function mockFetch() {
  const fn = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
  vi.stubGlobal("fetch", fn);
  return fn;
}
afterEach(() => vi.unstubAllGlobals());
const sent = (fn: ReturnType<typeof mockFetch>, i: number) => JSON.parse(fn.mock.calls[i][1].body);
const where = (fn: ReturnType<typeof mockFetch>, i: number) => `${fn.mock.calls[i][1]?.method ?? "GET"} ${String(fn.mock.calls[i][0]).replace(/^.*\/api/, "")}`;

describe("pictures in comments: the requests", () => {
  it("send the picture's address only when there is one", async () => {
    const fetchFn = mockFetch();
    await postsApi.addComment("p1", "Nice");
    await postsApi.addComment("p1", "Nice", "https://x/a.png");
    await profilesApi.addComment("zoe", "Nice");
    await profilesApi.addComment("zoe", "", "https://x/b.png");
    await mediaApi.addComment("m1", "Nice");
    await mediaApi.addComment("m1", "Nice", "https://x/c.png");
    expect([0, 1, 2, 3, 4, 5].map((i) => sent(fetchFn, i))).toEqual([
      { content: "Nice" },
      { content: "Nice", imageUrl: "https://x/a.png" },
      { content: "Nice" },
      { content: "", imageUrl: "https://x/b.png" },
      { content: "Nice" },
      { content: "Nice", imageUrl: "https://x/c.png" },
    ]);
  });

  it("take a picture off a comment by sending null to the comment's own address", async () => {
    const fetchFn = mockFetch();
    await postsApi.removeCommentPicture("c1");
    await profilesApi.removeCommentPicture("c2");
    await mediaApi.removeCommentPicture("c3");
    expect([0, 1, 2].map((i) => where(fetchFn, i))).toEqual(["PATCH /comments/c1", "PATCH /profiles/comments/c2", "PATCH /media/comments/c3"]);
    expect([0, 1, 2].map((i) => sent(fetchFn, i))).toEqual([{ imageUrl: null }, { imageUrl: null }, { imageUrl: null }]);
  });
});
