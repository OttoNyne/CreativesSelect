/**
 * Keeps the screen from turning off while something that needs it (a live broadcast) is going on, because a phone that
 * locks its screen pauses the microphone and the network connection of the page. Quietly does nothing where the browser
 * has no such feature. Returns a function that gives the screen back.
 *
 * The browser drops the lock whenever the page is hidden, so it is asked for again each time the page comes back.
 */
export function keepScreenOn(): () => void {
  const wakeLock = typeof navigator !== "undefined" ? (navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock : undefined;
  if (!wakeLock) return () => {};
  let lock: { release(): Promise<void> } | null = null;
  let released = false;

  const acquire = async () => {
    try {
      const next = await wakeLock.request("screen");
      if (released) void next.release().catch(() => {});
      else lock = next;
    } catch {
      // refused (low battery, or the page isn't visible): the live carries on, the screen may just turn off
    }
  };
  const onVisible = () => {
    if (document.visibilityState === "visible" && !released) void acquire();
  };

  void acquire();
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    released = true;
    document.removeEventListener("visibilitychange", onVisible);
    void lock?.release().catch(() => {});
    lock = null;
  };
}
