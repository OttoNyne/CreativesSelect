import { afterEach, describe, expect, it, vi } from "vitest";
import { eventsApi } from "./events.api";

function mockFetch() {
  const fn = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
  vi.stubGlobal("fetch", fn);
  return fn;
}
afterEach(() => vi.unstubAllGlobals());

describe("eventsApi", () => {
  it("asks for the right list and page, and leaves out what is usual", async () => {
    const fetchFn = mockFetch();
    await eventsApi.list();
    await eventsApi.list("going");
    await eventsApi.list("mine", 3);
    await eventsApi.list("upcoming", 2);
    const urls = fetchFn.mock.calls.map(([url]) => String(url).replace(/^.*\/api/, ""));
    expect(urls).toEqual(["/events", "/events?filter=going", "/events?filter=mine&page=3", "/events?page=2"]);
  });

  it("reads, plans, changes, cancels and answers by the right addresses", async () => {
    const fetchFn = mockFetch();
    await eventsApi.get("e1");
    await eventsApi.create({ title: "x" });
    await eventsApi.update("e1", { title: "y" });
    await eventsApi.cancel("e1");
    await eventsApi.rsvp("e1", "going");
    await eventsApi.guests("e1");
    await eventsApi.guests("e1", "maybe", 2);
    const calls = fetchFn.mock.calls.map(([url, init]) => `${init?.method ?? "GET"} ${String(url).replace(/^.*\/api/, "")}`);
    expect(calls).toEqual(["GET /events/e1", "POST /events", "PATCH /events/e1", "DELETE /events/e1", "PUT /events/e1/rsvp", "GET /events/e1/guests?status=going", "GET /events/e1/guests?status=maybe&page=2"]);
    expect(JSON.parse(fetchFn.mock.calls[4][1].body)).toEqual({ status: "going" });
  });

  it("gives the address of the calendar file", () => {
    expect(eventsApi.calendarUrl("e1")).toMatch(/\/api\/events\/e1\/calendar\.ics$/);
  });
});
