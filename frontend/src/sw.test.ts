import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The service worker (public/sw.js) is plain script that expects a browser's worker environment, so it is run here against a stand-in.
type Handler = (event: Record<string, unknown>) => void;
const handlers = new Map<string, Handler>();
const showNotification = vi.fn();
const matchAll = vi.fn();
const openWindow = vi.fn();
const claim = vi.fn();
const skipWaiting = vi.fn();

beforeEach(() => {
  handlers.clear();
  [showNotification, matchAll, openWindow, claim, skipWaiting].forEach((f) => f.mockReset());
  const self = {
    location: { origin: "https://www.creativesselect.com" },
    registration: { showNotification },
    clients: { matchAll, openWindow, claim },
    skipWaiting,
    addEventListener: (type: string, fn: Handler) => handlers.set(type, fn),
  };
  new Function("self", readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8"))(self);
});

/** An event whose waitUntil keeps the promise it is given, so the test can wait for it. */
function event(extra: Record<string, unknown> = {}) {
  const waits: Promise<unknown>[] = [];
  return { ...extra, waitUntil: (p: Promise<unknown>) => waits.push(Promise.resolve(p)), done: () => Promise.all(waits) };
}
const pushOf = (data: unknown) => event({ data: { json: () => data } });
async function push(data: unknown) {
  const e = pushOf(data);
  handlers.get("push")!(e);
  await e.done();
}
const shown = () => showNotification.mock.calls[0] as [string, Record<string, unknown>];

describe("the service worker: showing a push", () => {
  it("shows what the server sent, with the site's icon and where tapping it goes", async () => {
    await push({ title: "CreativesSelect", body: "Zoe sent you a message", url: "/messages/zoe", tag: "message-1" });
    const [title, options] = shown();
    expect(title).toBe("CreativesSelect");
    expect(options).toMatchObject({ body: "Zoe sent you a message", icon: "/icon-192.png", badge: "/icon-192.png", data: { url: "/messages/zoe" }, tag: "message-1", renotify: true });
  });

  it("does not make a later notification with the same tag stay silent, and a notification without a tag has none", async () => {
    await push({ title: "T", body: "B", url: "/" });
    const [, options] = shown();
    expect(options.tag).toBeUndefined();
    expect(options.renotify).toBeUndefined();
  });

  it("only ever sends someone to a page on this site", async () => {
    for (const url of ["https://evil.example.com/x", "//evil.example.com/x", "javascript:alert(1)", "data:text/html,hi", "messages", "", 5, null, undefined, {}]) {
      showNotification.mockReset();
      await push({ title: "T", body: "B", url });
      expect(shown()[1].data, String(url)).toEqual({ url: "/" });
    }
    showNotification.mockReset();
    await push({ title: "T", body: "B", url: "/events/5?x=1#top" });
    expect(shown()[1].data).toEqual({ url: "/events/5?x=1#top" });
  });

  it("still shows something when the message is empty or isn't readable, because a browser requires that of every push", async () => {
    const empty = event({ data: null });
    handlers.get("push")!(empty);
    await empty.done();
    const broken = event({ data: { json: () => { throw new SyntaxError("bad"); } } });
    handlers.get("push")!(broken);
    await broken.done();
    expect(showNotification).toHaveBeenCalledTimes(2);
    for (const [title, options] of showNotification.mock.calls) {
      expect(title).toBe("CreativesSelect");
      expect(options).toMatchObject({ body: "", data: { url: "/" } });
    }
  });

  it("keeps what it shows short, and ignores anything that isn't text", async () => {
    await push({ title: "T".repeat(500), body: "B".repeat(2000), tag: "g".repeat(500), url: "/" });
    const [title, options] = shown();
    expect(title).toHaveLength(80);
    expect((options.body as string).length).toBe(200);
    expect((options.tag as string).length).toBe(100);
    showNotification.mockReset();
    await push({ title: 5, body: { a: 1 }, tag: [1], url: "/" });
    expect(shown()).toEqual(["CreativesSelect", expect.objectContaining({ body: "", data: { url: "/" } })]);
  });
});

describe("the service worker: tapping a notification", () => {
  const tap = async (url: unknown) => {
    const close = vi.fn();
    const e = event({ notification: { close, data: url === undefined ? undefined : { url } } });
    handlers.get("notificationclick")!(e);
    await e.done();
    return close;
  };

  it("closes it and brings an open tab of the site forward at the right page", async () => {
    const navigate = vi.fn().mockResolvedValue(undefined);
    const focus = vi.fn().mockResolvedValue(undefined);
    matchAll.mockResolvedValue([{ url: "https://other.example.com/", focus: vi.fn(), navigate: vi.fn() }, { url: "https://www.creativesselect.com/friends", navigate, focus }]);
    const close = await tap("/messages/zoe");
    expect(close).toHaveBeenCalled();
    expect(matchAll).toHaveBeenCalledWith({ type: "window", includeUncontrolled: true });
    expect(navigate).toHaveBeenCalledWith("/messages/zoe");
    expect(focus).toHaveBeenCalled();
    expect(openWindow).not.toHaveBeenCalled();
  });

  it("opens the site when there is no tab of it, and never at an address that isn't on it", async () => {
    matchAll.mockResolvedValue([{ url: "https://other.example.com/", focus: vi.fn(), navigate: vi.fn() }]);
    await tap("/live/9");
    expect(openWindow).toHaveBeenLastCalledWith("/live/9");
    await tap("https://evil.example.com/");
    expect(openWindow).toHaveBeenLastCalledWith("/");
    await tap(undefined);
    expect(openWindow).toHaveBeenLastCalledWith("/");
  });

  it("still brings the tab forward if the browser can't move it to the page", async () => {
    const focus = vi.fn().mockResolvedValue(undefined);
    matchAll.mockResolvedValue([{ url: "https://www.creativesselect.com/", focus }]);
    await tap("/friends");
    expect(focus).toHaveBeenCalled();
    const failing = { url: "https://www.creativesselect.com/", navigate: vi.fn().mockRejectedValue(new Error("no")), focus: vi.fn().mockResolvedValue(undefined) };
    matchAll.mockResolvedValue([failing]);
    await tap("/friends");
    expect(failing.focus).toHaveBeenCalled();
  });
});

describe("the service worker: staying out of the way", () => {
  it("takes over at once when installed, and answers no requests and keeps no copies of the site", () => {
    handlers.get("install")!(event());
    expect(skipWaiting).toHaveBeenCalled();
    const e = event();
    handlers.get("activate")!(e);
    expect(claim).toHaveBeenCalled();
    expect([...handlers.keys()].sort()).toEqual(["activate", "install", "notificationclick", "push"]);
    expect(handlers.has("fetch")).toBe(false);
  });

  it("is plain text in the repository that names no cache", () => {
    const source = readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8");
    expect(source).not.toMatch(/caches\.|cache\.add|cache\.put|\bfetch\(/);
  });
});
