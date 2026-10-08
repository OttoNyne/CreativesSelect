import { afterEach, describe, expect, it, vi } from "vitest";
import { SEARCH_TYPES, isSearchType, searchApi } from "./search.api";

afterEach(() => vi.unstubAllGlobals());

describe("searchApi", () => {
  it("asks with the question and kind, adding the filters and page only when they matter", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchFn);
    await searchApi.search({ q: "hand thrown & glazed", type: "blog" });
    await searchApi.search({ q: "kiln", type: "people", tag: "potter", connection: "mutual", page: 3 });
    await searchApi.search({ q: "kiln", type: "people", connection: "any", page: 1 });
    const urls = fetchFn.mock.calls.map(([url]) => String(url).replace(/^.*\/api/, ""));
    expect(urls).toEqual(["/search?q=hand+thrown+%26+glazed&type=blog", "/search?q=kiln&type=people&tag=potter&connection=mutual&page=3", "/search?q=kiln&type=people"]);
  });

  it("knows the five kinds of search", () => {
    expect(SEARCH_TYPES.map((t) => t.type)).toEqual(["people", "blog", "groups", "topics", "help"]);
    expect(isSearchType("topics")).toBe(true);
    expect(isSearchType("everything")).toBe(false);
    expect(isSearchType(null)).toBe(false);
  });
});

describe("searching only those open to work", () => {
  it("adds open=1 when asked, and nothing when not", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchFn);
    await searchApi.search({ q: "logo", type: "people", open: true });
    await searchApi.search({ q: "logo", type: "people", open: false });
    const urls = fetchFn.mock.calls.map((c) => String(c[0]).replace(/^.*\/api/, ""));
    expect(urls).toEqual(["/search?q=logo&type=people&open=1", "/search?q=logo&type=people"]);
  });
});
