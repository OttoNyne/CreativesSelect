import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PushError, currentSubscription, disablePush, enablePush, keyToBytes, notificationPermission, pushSupport, turnOffThisDevice } from "./push";
import { pushApi } from "../api/push.api";

vi.mock("../api/push.api", () => ({ pushApi: { subscribe: vi.fn(), unsubscribe: vi.fn() } }));
const subscribeApi = vi.mocked(pushApi.subscribe);
const unsubscribeApi = vi.mocked(pushApi.unsubscribe);

// What a browser has, put in place for each test and taken away again after.
const originals = new Map<string, PropertyDescriptor | undefined>();
function setGlobal(target: object, name: string, value: unknown) {
  const key = `${target === window ? "window" : "navigator"}.${name}`;
  if (!originals.has(key)) originals.set(key, Object.getOwnPropertyDescriptor(target, name));
  Object.defineProperty(target, name, { value, configurable: true, writable: true });
}
function removeGlobal(target: object, name: string) {
  const key = `${target === window ? "window" : "navigator"}.${name}`;
  if (!originals.has(key)) originals.set(key, Object.getOwnPropertyDescriptor(target, name));
  delete (target as Record<string, unknown>)[name];
}
afterEach(() => {
  for (const [key, descriptor] of originals) {
    const [where, name] = key.split(".");
    const target = where === "window" ? window : navigator;
    if (descriptor) Object.defineProperty(target, name, descriptor);
    else delete (target as unknown as Record<string, unknown>)[name];
  }
  originals.clear();
  vi.clearAllMocks();
});

const sub = (endpoint = "https://fcm.googleapis.com/fcm/send/abc") => ({
  endpoint,
  toJSON: () => ({ endpoint, keys: { p256dh: "pk", auth: "ak" } }),
  unsubscribe: vi.fn().mockResolvedValue(true),
});

/** A browser that can do push, with the registration and subscription it hands out. */
function fullBrowser(existing: ReturnType<typeof sub> | null = null) {
  const created = sub();
  const pushManager = { getSubscription: vi.fn().mockResolvedValue(existing), subscribe: vi.fn().mockResolvedValue(created) };
  const registration = { pushManager };
  setGlobal(navigator, "serviceWorker", { register: vi.fn().mockResolvedValue(registration), ready: Promise.resolve(registration), getRegistration: vi.fn().mockResolvedValue(registration) });
  setGlobal(window, "PushManager", class {});
  setGlobal(window, "Notification", Object.assign(class {}, { permission: "default", requestPermission: vi.fn().mockResolvedValue("granted") }));
  return { pushManager, registration, created };
}

describe("pushSupport", () => {
  it("is supported where the browser has a worker, push and notifications", () => {
    fullBrowser();
    expect(pushSupport()).toBe("supported");
  });

  it("is unsupported in a browser without them", () => {
    removeGlobal(navigator, "serviceWorker");
    removeGlobal(window, "PushManager");
    expect(pushSupport()).toBe("unsupported");
  });

  it("asks an iPhone to add the site to the Home Screen first, since that is when it can", () => {
    removeGlobal(window, "PushManager");
    setGlobal(navigator, "userAgent", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1");
    setGlobal(window, "matchMedia", () => ({ matches: false }));
    expect(pushSupport()).toBe("needs-install");
    // once it is on the Home Screen, an iPhone has what it needs, so the answer comes from the browser having it
    fullBrowser();
    expect(pushSupport()).toBe("supported");
  });

  it("doesn't ask for that of an iPhone that is already installed but still can't", () => {
    removeGlobal(window, "PushManager");
    setGlobal(navigator, "userAgent", "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)");
    setGlobal(window, "matchMedia", () => ({ matches: true }));
    expect(pushSupport()).toBe("unsupported");
  });
});

describe("keyToBytes", () => {
  it("turns the server's public key into the bytes a browser wants, whatever padding it has lost", () => {
    expect([...keyToBytes("AQID")]).toEqual([1, 2, 3]);
    expect([...keyToBytes("AQI")]).toEqual([1, 2]);
    expect([...keyToBytes("-_8")]).toEqual([251, 255]);
  });
});

describe("notificationPermission", () => {
  it("is what the browser says, and 'denied' where there are no notifications", () => {
    setGlobal(window, "Notification", { permission: "granted" });
    expect(notificationPermission()).toBe("granted");
    removeGlobal(window, "Notification");
    expect(notificationPermission()).toBe("denied");
  });
});

describe("enablePush", () => {
  it("asks permission, signs the browser up with the server's key, and tells the server", async () => {
    const { pushManager, created } = fullBrowser();
    subscribeApi.mockResolvedValue({ subscribed: true });
    await enablePush("AQID");
    expect(window.Notification.requestPermission).toHaveBeenCalled();
    expect(navigator.serviceWorker.register).toHaveBeenCalledWith("/sw.js");
    expect(pushManager.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: expect.any(Uint8Array) });
    expect(subscribeApi).toHaveBeenCalledWith(created.toJSON());
  });

  it("uses the subscription the browser already has rather than making another", async () => {
    const existing = sub("https://fcm.googleapis.com/fcm/send/old");
    const { pushManager } = fullBrowser(existing);
    subscribeApi.mockResolvedValue({ subscribed: true });
    await enablePush("AQID");
    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(subscribeApi).toHaveBeenCalledWith(existing.toJSON());
  });

  it("stops, without touching the server, when the person says no", async () => {
    fullBrowser();
    (window.Notification.requestPermission as ReturnType<typeof vi.fn>).mockResolvedValue("denied");
    await expect(enablePush("AQID")).rejects.toMatchObject({ reason: "denied", message: expect.stringMatching(/blocked/) });
    expect(subscribeApi).not.toHaveBeenCalled();
    expect(navigator.serviceWorker.register).not.toHaveBeenCalled();
  });

  it("says something sayable when the browser can't set it up", async () => {
    const { pushManager } = fullBrowser();
    pushManager.subscribe.mockRejectedValue(new DOMException("push service error", "AbortError"));
    await expect(enablePush("AQID")).rejects.toBeInstanceOf(PushError);
    await expect(enablePush("AQID")).rejects.toMatchObject({ reason: "failed", message: expect.stringMatching(/couldn't set up/) });
    expect(subscribeApi).not.toHaveBeenCalled();
  });
});

describe("currentSubscription and disablePush", () => {
  it("is none where push can't work or nothing is registered", async () => {
    removeGlobal(navigator, "serviceWorker");
    removeGlobal(window, "PushManager");
    expect(await currentSubscription()).toBeNull();
    fullBrowser();
    (navigator.serviceWorker.getRegistration as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    expect(await currentSubscription()).toBeNull();
  });

  it("turns off by telling the server first and then the browser", async () => {
    const existing = sub();
    fullBrowser(existing);
    unsubscribeApi.mockResolvedValue(undefined);
    await disablePush();
    expect(unsubscribeApi).toHaveBeenCalledWith(existing.endpoint);
    expect(existing.unsubscribe).toHaveBeenCalled();
    expect(unsubscribeApi.mock.invocationCallOrder[0]).toBeLessThan(existing.unsubscribe.mock.invocationCallOrder[0]);
  });

  it("has nothing to do when the device isn't signed up", async () => {
    fullBrowser(null);
    await disablePush();
    expect(unsubscribeApi).not.toHaveBeenCalled();
  });
});

describe("turnOffThisDevice (when logging out)", () => {
  it("does it, and never throws if it can't", async () => {
    const existing = sub();
    fullBrowser(existing);
    unsubscribeApi.mockRejectedValue(new Error("offline"));
    await expect(turnOffThisDevice()).resolves.toBeUndefined();
    expect(unsubscribeApi).toHaveBeenCalled();
  });

  it("doesn't hold the logout up for more than a few seconds", async () => {
    vi.useFakeTimers();
    try {
      fullBrowser(sub());
      unsubscribeApi.mockReturnValue(new Promise(() => {}) as never); // never answers
      const done = vi.fn();
      const run = turnOffThisDevice().then(done);
      await vi.advanceTimersByTimeAsync(2900);
      expect(done).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(200);
      await run;
      expect(done).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

beforeEach(() => {
  subscribeApi.mockReset();
  unsubscribeApi.mockReset();
});
