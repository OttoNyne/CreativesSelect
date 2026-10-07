import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Listener = (event: { data?: string }) => void;

/** A stand-in for the browser's EventSource that the tests can push events through. */
class FakeSource {
  static instances: FakeSource[] = [];
  static CLOSED = 2;
  readyState = 0;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  listeners = new Map<string, Listener[]>();
  closed = false;
  url: string;
  init?: { withCredentials?: boolean };
  constructor(url: string, init?: { withCredentials?: boolean }) {
    this.url = url;
    this.init = init;
    FakeSource.instances.push(this);
  }
  addEventListener(type: string, fn: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  close() {
    this.closed = true;
    this.readyState = 2;
  }
  // test helpers
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  emit(type: string, data?: string) {
    for (const fn of this.listeners.get(type) ?? []) fn({ data });
  }
  fail(permanently = false) {
    if (permanently) this.readyState = 2;
    this.onerror?.();
  }
}

let mod: typeof import("./liveUpdates");
const last = () => FakeSource.instances.at(-1)!;

beforeEach(async () => {
  FakeSource.instances = [];
  vi.stubGlobal("EventSource", FakeSource);
  vi.useFakeTimers();
  vi.resetModules();
  mod = await import("./liveUpdates");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the connection", () => {
  it("is made when the first page part asks for hints, once however many ask, and with the sign-in cookie", () => {
    const stopA = mod.liveUpdates.subscribe("notification", () => {});
    const stopB = mod.liveUpdates.subscribe("message", () => {});
    expect(FakeSource.instances).toHaveLength(1);
    expect(last().url).toMatch(/\/api\/updates\/stream$/);
    expect(last().init).toEqual({ withCredentials: true });
    stopA();
    expect(last().closed).toBe(false); // someone still wants it
    stopB();
    expect(last().closed).toBe(true);
  });

  it("is not made at all in a browser that has no EventSource, and nothing breaks", () => {
    vi.stubGlobal("EventSource", undefined);
    const stop = mod.liveUpdates.subscribe("notification", () => {});
    expect(FakeSource.instances).toHaveLength(0);
    expect(mod.liveUpdates.isConnected()).toBe(false);
    stop();
  });

  it("says when it is up and when it goes down, to whoever is listening", () => {
    const seen: boolean[] = [];
    mod.liveUpdates.onConnection((c) => seen.push(c));
    mod.liveUpdates.subscribe("message", () => {});
    last().open();
    expect(mod.liveUpdates.isConnected()).toBe(true);
    last().fail();
    expect(mod.liveUpdates.isConnected()).toBe(false);
    last().open();
    expect(seen).toEqual([true, false, true]);
  });

  it("lets the browser reconnect by itself after a dropped connection, without opening another", () => {
    mod.liveUpdates.subscribe("message", () => {});
    last().open();
    last().fail(); // dropped; the browser is retrying
    vi.advanceTimersByTime(60_000);
    expect(FakeSource.instances).toHaveLength(1);
  });

  it("tries again later when the server refused for good, and not at all if nobody wants it any more", () => {
    const stop = mod.liveUpdates.subscribe("message", () => {});
    last().fail(true);
    expect(FakeSource.instances).toHaveLength(1);
    vi.advanceTimersByTime(30_000);
    expect(FakeSource.instances).toHaveLength(2);

    last().fail(true);
    stop();
    vi.advanceTimersByTime(60_000);
    expect(FakeSource.instances).toHaveLength(2);
  });

  it("opens a fresh connection at once when the server says it is time to reconnect", () => {
    mod.liveUpdates.subscribe("message", () => {});
    last().open();
    const first = last();
    first.emit("reconnect");
    expect(first.closed).toBe(true);
    expect(FakeSource.instances).toHaveLength(2);
  });

  it("backs off when the server says this sign-in has ended, and tries again later", () => {
    mod.liveUpdates.subscribe("message", () => {});
    last().open();
    const first = last();
    first.emit("signed-out");
    expect(first.closed).toBe(true);
    expect(mod.liveUpdates.isConnected()).toBe(false);
    expect(FakeSource.instances).toHaveLength(1);
    vi.advanceTimersByTime(30_000);
    expect(FakeSource.instances).toHaveLength(2);
  });
});

describe("the hints", () => {
  it("go to the handlers for that kind only, with what the server sent", () => {
    const onNotification = vi.fn();
    const onMessage = vi.fn();
    mod.liveUpdates.subscribe("notification", onNotification);
    mod.liveUpdates.subscribe("message", onMessage);
    last().emit("message", '{"with":"sam"}');
    expect(onMessage).toHaveBeenCalledWith({ with: "sam" });
    expect(onNotification).not.toHaveBeenCalled();
    last().emit("notification", "{}");
    expect(onNotification).toHaveBeenCalledWith({});
  });

  it("still count when what came with them can't be read", () => {
    const handler = vi.fn();
    mod.liveUpdates.subscribe("notification", handler);
    last().emit("notification", "not json");
    last().emit("notification", undefined);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenCalledWith({});
  });

  it("stop going to a handler once it has stopped listening, and one handler failing doesn't need the others to", () => {
    const a = vi.fn();
    const b = vi.fn();
    const stopA = mod.liveUpdates.subscribe("message", a);
    mod.liveUpdates.subscribe("message", b);
    stopA();
    last().emit("message", "{}");
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });
});

describe("useLiveRefresh", () => {
  it("reloads when the server says this kind of thing happened, with the hint", () => {
    const reload = vi.fn();
    renderHook(() => mod.useLiveRefresh("message", reload, 5_000, 60_000));
    last().open();
    reload.mockClear();
    act(() => last().emit("message", '{"with":"sam"}'));
    expect(reload).toHaveBeenCalledWith({ with: "sam" });
  });

  it("reloads when the connection comes back, to catch what it missed", () => {
    const reload = vi.fn();
    renderHook(() => mod.useLiveRefresh("notification", reload, 5_000, 60_000));
    expect(reload).not.toHaveBeenCalled();
    act(() => last().open());
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("polls at the fast pace while the connection is down, and the slow one while it is up", () => {
    const reload = vi.fn();
    renderHook(() => mod.useLiveRefresh("message", reload, 5_000, 60_000));
    act(() => vi.advanceTimersByTime(15_000));
    expect(reload).toHaveBeenCalledTimes(3); // down: every 5 seconds

    act(() => last().open());
    reload.mockClear();
    act(() => vi.advanceTimersByTime(30_000));
    expect(reload).not.toHaveBeenCalled(); // up: quiet
    act(() => vi.advanceTimersByTime(30_000));
    expect(reload).toHaveBeenCalledTimes(1);

    act(() => last().fail());
    reload.mockClear();
    act(() => vi.advanceTimersByTime(10_000));
    expect(reload).toHaveBeenCalledTimes(2); // down again: fast again
  });

  it("uses the latest function it was given, not the first", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ fn }) => mod.useLiveRefresh("message", fn, 5_000, 60_000), { initialProps: { fn: first } });
    rerender({ fn: second });
    act(() => last().emit("message", "{}"));
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it("lets go of the hints and the timer when the page part goes away, closing the connection", () => {
    const reload = vi.fn();
    const { unmount } = renderHook(() => mod.useLiveRefresh("message", reload, 5_000, 60_000));
    unmount();
    expect(last().closed).toBe(true);
    reload.mockClear();
    vi.advanceTimersByTime(120_000);
    expect(reload).not.toHaveBeenCalled();
  });

  it("works with the old polling alone in a browser with no EventSource", () => {
    vi.stubGlobal("EventSource", undefined);
    const reload = vi.fn();
    renderHook(() => mod.useLiveRefresh("notification", reload, 5_000, 60_000));
    act(() => vi.advanceTimersByTime(10_000));
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
