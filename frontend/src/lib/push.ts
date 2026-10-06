import { pushApi, type DeviceSubscription } from "../api/push.api";

// Push notifications in the browser: the permission, the service worker (public/sw.js) and the subscription that ties this device to the
// account. Nothing is asked of the person until they press the button.

export type PushSupport = "supported" | "needs-install" | "unsupported";

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isInstalled = () => window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Whether this browser can do it. On an iPhone it only can once the site has been added to the Home Screen and opened from there. */
export function pushSupport(): PushSupport {
  const has = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (has) return "supported";
  return isIos() && !isInstalled() ? "needs-install" : "unsupported";
}

export const notificationPermission = (): NotificationPermission => ("Notification" in window ? Notification.permission : "denied");

/** A public key as the browser wants it: bytes rather than text. */
export function keyToBytes(base64Url: string): Uint8Array {
  const padded = base64Url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64Url.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  return navigator.serviceWorker.getRegistration("/");
}

/** This device's subscription, if it has one. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== "supported") return null;
  const reg = await registration();
  return reg ? reg.pushManager.getSubscription() : null;
}

export class PushError extends Error {
  reason: "denied" | "failed";
  constructor(reason: "denied" | "failed", message: string) {
    super(message);
    this.reason = reason;
  }
}

/** Ask permission, register the worker, subscribe, and tell the server. Throws a PushError with something sayable. */
export async function enablePush(publicKey: string): Promise<void> {
  if ((await Notification.requestPermission()) !== "granted") throw new PushError("denied", "Notifications are blocked for this site. Allow them in your browser's settings for this site, then try again.");
  let subscription: PushSubscription;
  try {
    await navigator.serviceWorker.register("/sw.js");
    const reg = await navigator.serviceWorker.ready;
    subscription = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) as BufferSource }));
  } catch {
    throw new PushError("failed", "Your browser couldn't set up notifications. Try again, or use a different browser.");
  }
  await pushApi.subscribe(subscription.toJSON() as DeviceSubscription);
}

/** Turn them off for this device: the server forgets it, and so does the browser. */
export async function disablePush(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;
  await pushApi.unsubscribe(subscription.endpoint);
  await subscription.unsubscribe();
}

/** Used when someone logs out: stop this device getting that account's notifications. Never throws and never holds the logout up for long. */
export async function turnOffThisDevice(): Promise<void> {
  try {
    await Promise.race([disablePush(), new Promise((resolve) => setTimeout(resolve, 3000))]);
  } catch {
    // the logout goes ahead regardless
  }
}
