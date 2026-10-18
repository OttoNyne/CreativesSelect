import { afterEach, describe, expect, it, vi } from "vitest";
import { liveApi } from "./live.api";

afterEach(() => vi.unstubAllGlobals());

function mockFetch() {
  const fn = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
  vi.stubGlobal("fetch", fn);
  return fn;
}
const sent = (fn: ReturnType<typeof mockFetch>) => fn.mock.calls.map(([url, init]) => ({ call: `${init?.method ?? "GET"} ${String(url).replace(/^.*\/api/, "")}`, body: init?.body ? JSON.parse(init.body) : undefined }));

describe("liveApi: starting", () => {
  it("starts an ordinary live with just a title, naming the plan when there is one", async () => {
    const fetchFn = mockFetch();
    await liveApi.start("Open mic");
    await liveApi.start("Planned", "p1");
    expect(sent(fetchFn)).toEqual([
      { call: "POST /live", body: { title: "Open mic" } },
      { call: "POST /live", body: { title: "Planned", scheduledId: "p1" } },
    ]);
  });

  it("starts an invite-only live with the friends picked, and never sends a list for an ordinary one", async () => {
    const fetchFn = mockFetch();
    await liveApi.start("Just us", undefined, { private: true, invite: ["a", "b"] });
    await liveApi.start("Just us", undefined, { private: true });
    await liveApi.start("Open", undefined, { private: false, invite: ["a"] });
    expect(sent(fetchFn)).toEqual([
      { call: "POST /live", body: { title: "Just us", private: true, invite: ["a", "b"] } },
      { call: "POST /live", body: { title: "Just us", private: true, invite: [] } },
      { call: "POST /live", body: { title: "Open" } },
    ]);
  });
});

describe("liveApi: invitations", () => {
  it("lists, adds and takes back invitations", async () => {
    const fetchFn = mockFetch();
    await liveApi.invites("l1");
    await liveApi.invite("l1", ["a"]);
    await liveApi.uninvite("l1", "a");
    expect(sent(fetchFn)).toEqual([
      { call: "GET /live/l1/invites", body: undefined },
      { call: "POST /live/l1/invites", body: { userIds: ["a"] } },
      { call: "DELETE /live/l1/invites/a", body: undefined },
    ]);
  });
});
