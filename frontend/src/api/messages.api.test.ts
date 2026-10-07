import { afterEach, describe, expect, it, vi } from "vitest";
import { messagesApi } from "./messages.api";

afterEach(() => vi.unstubAllGlobals());

describe("messagesApi.typing", () => {
  it("posts to the friend's typing address with the name safely encoded and nothing private in it", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal("fetch", fetchFn);
    await messagesApi.typing("zoe");
    await messagesApi.typing("a/b c");
    const calls = fetchFn.mock.calls.map(([url, init]) => `${init?.method} ${String(url).replace(/^.*\/api/, "")} ${init?.body}`);
    expect(calls).toEqual(["POST /messages/with/zoe/typing {}", "POST /messages/with/a%2Fb%20c/typing {}"]);
  });
});
