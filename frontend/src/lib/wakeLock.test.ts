import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { keepScreenOn } from "./wakeLock";

function stubWakeLock() {
  const sentinels: { release: ReturnType<typeof vi.fn> }[] = [];
  const request = vi.fn(async () => {
    const sentinel = { release: vi.fn(async () => {}) };
    sentinels.push(sentinel);
    return sentinel;
  });
  Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });
  return { request, sentinels };
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const setVisibility = (state: "visible" | "hidden") => {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
};

beforeEach(() => setVisibility("visible"));
afterEach(() => {
  Object.defineProperty(navigator, "wakeLock", { value: undefined, configurable: true });
});

describe("keepScreenOn", () => {
  it("does nothing, quietly, on a browser with no screen lock", () => {
    Object.defineProperty(navigator, "wakeLock", { value: undefined, configurable: true });
    const release = keepScreenOn();
    expect(() => release()).not.toThrow();
  });

  it("asks to keep the screen on, and gives it back when released", async () => {
    const { request, sentinels } = stubWakeLock();
    const release = keepScreenOn();
    await flush();
    expect(request).toHaveBeenCalledWith("screen");
    release();
    expect(sentinels[0].release).toHaveBeenCalled();
  });

  it("asks again when the page comes back (the browser drops the lock whenever the page is hidden)", async () => {
    const { request } = stubWakeLock();
    const release = keepScreenOn();
    await flush();
    setVisibility("hidden");
    expect(request).toHaveBeenCalledTimes(1); // not while hidden
    setVisibility("visible");
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
    release();
  });

  it("stops asking once released, and gives back a lock that arrives late", async () => {
    const { request, sentinels } = stubWakeLock();
    const release = keepScreenOn();
    release(); // before the first answer arrives
    await flush();
    expect(sentinels[0].release).toHaveBeenCalled();
    setVisibility("hidden");
    setVisibility("visible");
    await flush();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("carries on quietly if the browser refuses", async () => {
    const request = vi.fn(async () => {
      throw new DOMException("low battery", "NotAllowedError");
    });
    Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });
    const release = keepScreenOn();
    await flush();
    expect(() => release()).not.toThrow();
  });
});
