// Helpers for the "add this site to your Home Screen" prompt shown to iPhone and iPad visitors.
//
// Apple gives no browser an install button for web apps (Chrome, Edge and Firefox on iOS all run on Safari's
// engine); the only route is Share, then "Add to Home Screen". So the site shows its own short instructions.

const DISMISSED_KEY = "install-banner-dismissed";
const SHOW_AGAIN_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

export function isIOS(nav: Pick<Navigator, "userAgent" | "platform" | "maxTouchPoints"> = navigator): boolean {
  if (/iPhone|iPad|iPod/i.test(nav.userAgent)) return true;
  // iPadOS 13+ pretends to be a Mac; the giveaway is that a real Mac has no touch screen.
  return nav.platform === "MacIntel" && (nav.maxTouchPoints ?? 0) > 1;
}

// True once the site has been opened from the Home Screen icon (so there is nothing left to install).
export function isStandalone(): boolean {
  const iosFlag = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const displayMode = typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches;
  return iosFlag || displayMode;
}

// Storage can be unavailable (private browsing, blocked site data); then the prompt simply comes back next visit.
export function wasDismissedRecently(now = Date.now()): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISSED_KEY));
    return Number.isFinite(at) && at > 0 && now - at < SHOW_AGAIN_AFTER_MS;
  } catch {
    return false;
  }
}

export function rememberDismissed(now = Date.now()) {
  try {
    localStorage.setItem(DISMISSED_KEY, String(now));
  } catch {
    // fine: it just won't be remembered
  }
}
