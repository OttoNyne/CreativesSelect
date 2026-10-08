import { afterEach, describe, expect, it, vi } from "vitest";
import { mentionsApi } from "./mentions.api";

afterEach(() => vi.unstubAllGlobals());

describe("mentionsApi", () => {
  it("asks for the people to offer for what has been typed, safely encoded", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ people: [] }) });
    vi.stubGlobal("fetch", fetchFn);
    await mentionsApi.suggest("sa");
    await mentionsApi.suggest("");
    await mentionsApi.suggest("a&b=c");
    expect(fetchFn.mock.calls.map(([url]) => String(url).replace(/^.*\/api/, ""))).toEqual(["/mentions/suggest?q=sa", "/mentions/suggest?q=", "/mentions/suggest?q=a%26b%3Dc"]);
  });
});
