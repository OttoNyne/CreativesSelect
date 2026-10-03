import { afterEach, describe, expect, it, vi } from "vitest";
import { isIOS, isStandalone, rememberDismissed, wasDismissedRecently } from "./install";

const nav = (userAgent: string, platform = "", maxTouchPoints = 0) => ({ userAgent, platform, maxTouchPoints });

describe("isIOS", () => {
  it("recognises iPhones and iPads, whichever browser they are using", () => {
    for (const ua of [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
    ]) {
      expect(isIOS(nav(ua))).toBe(true);
    }
  });

  it("recognises an iPad that pretends to be a Mac (it has a touch screen; a real Mac doesn't)", () => {
    const macUa = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
    expect(isIOS(nav(macUa, "MacIntel", 5))).toBe(true);
    expect(isIOS(nav(macUa, "MacIntel", 0))).toBe(false);
  });

  it("is false for Android, Windows and Linux", () => {
    expect(isIOS(nav("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/123.0 Mobile Safari/537.36", "Linux armv8l", 5))).toBe(false);
    expect(isIOS(nav("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123.0 Safari/537.36", "Win32", 0))).toBe(false);
    expect(isIOS(nav("Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101 Firefox/124.0", "Linux x86_64", 0))).toBe(false);
  });
});

describe("isStandalone", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (navigator as { standalone?: boolean }).standalone;
  });

  it("is false in an ordinary browser tab", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as never;
    expect(isStandalone()).toBe(false);
  });

  it("is true when opened from the iPhone Home Screen icon", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as never;
    Object.defineProperty(navigator, "standalone", { value: true, configurable: true });
    expect(isStandalone()).toBe(true);
  });

  it("is true when the browser reports standalone display mode", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never;
    expect(isStandalone()).toBe(true);
  });
});

describe("remembering a dismissal", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("starts as not dismissed, then remembers for 30 days", () => {
    expect(wasDismissedRecently()).toBe(false);
    const t0 = 1_700_000_000_000;
    rememberDismissed(t0);
    expect(wasDismissedRecently(t0 + 1000)).toBe(true);
    expect(wasDismissedRecently(t0 + 29 * 86_400_000)).toBe(true);
    expect(wasDismissedRecently(t0 + 31 * 86_400_000)).toBe(false);
  });

  it("ignores junk in storage", () => {
    for (const junk of ["", "abc", "-5", "NaN"]) {
      localStorage.setItem("install-banner-dismissed", junk);
      expect(wasDismissedRecently()).toBe(false);
    }
  });

  it("copes with storage being unavailable (private browsing): never throws, just isn't remembered", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => rememberDismissed()).not.toThrow();
    expect(wasDismissedRecently()).toBe(false);
  });
});
