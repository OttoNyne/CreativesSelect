import { afterEach, describe, expect, it, vi } from "vitest";
import { PUSH_CATEGORIES, pushApi } from "./push.api";

afterEach(() => vi.unstubAllGlobals());

describe("pushApi", () => {
  it("asks for, sets and removes by the right addresses, with the right bodies", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchFn);
    await pushApi.key();
    await pushApi.status();
    await pushApi.status("https://fcm.googleapis.com/fcm/send/a b");
    await pushApi.subscribe({ endpoint: "https://fcm.googleapis.com/fcm/send/a", keys: { p256dh: "p", auth: "a" } });
    await pushApi.unsubscribe("https://fcm.googleapis.com/fcm/send/a");
    await pushApi.setPrefs({ messages: false });
    await pushApi.test();
    const calls = fetchFn.mock.calls.map(([url, init]) => `${init?.method ?? "GET"} ${String(url).replace(/^.*\/api/, "")}${init?.body ? ` ${init.body}` : ""}`);
    expect(calls).toEqual([
      "GET /push/key",
      "GET /push/status",
      "GET /push/status?endpoint=https%3A%2F%2Ffcm.googleapis.com%2Ffcm%2Fsend%2Fa%20b",
      'POST /push/subscribe {"subscription":{"endpoint":"https://fcm.googleapis.com/fcm/send/a","keys":{"p256dh":"p","auth":"a"}}}',
      'POST /push/unsubscribe {"endpoint":"https://fcm.googleapis.com/fcm/send/a"}',
      'PATCH /push/preferences {"messages":false}',
      "POST /push/test",
    ]);
  });

  it("offers the six kinds, each with a name a person can read", () => {
    expect(PUSH_CATEGORIES.map((c) => c.name)).toEqual(["messages", "friends", "comments", "events", "live", "updates"]);
    for (const c of PUSH_CATEGORIES) {
      expect(c.label.length).toBeGreaterThan(2);
      expect(c.hint.length).toBeGreaterThan(10);
    }
  });
});
