import { afterEach, describe, expect, it, vi } from "vitest";
import { postsApi } from "./posts.api";
import { mediaApi } from "./media.api";

afterEach(() => vi.unstubAllGlobals());

describe("reacting", () => {
  it("sends the emoji (or null, to take it away) for a post and for a picture, to the right addresses", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ reactions: {} }) });
    vi.stubGlobal("fetch", fetchFn);
    await postsApi.react("p 1", "love");
    await postsApi.react("p1", null);
    await mediaApi.react("m1", "fire");
    await mediaApi.react("m1", null);
    const calls = fetchFn.mock.calls.map(([url, init]) => `${init?.method} ${String(url).replace(/^.*\/api/, "")} ${init?.body}`);
    expect(calls).toEqual([
      'PUT /posts/p%201/reaction {"emoji":"love"}',
      'PUT /posts/p1/reaction {"emoji":null}',
      'PUT /media/m1/reaction {"emoji":"fire"}',
      'PUT /media/m1/reaction {"emoji":null}',
    ]);
  });
});
