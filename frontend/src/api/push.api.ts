import { api } from "./client";
import { t } from "../i18n";

export type PushCategory = "messages" | "friends" | "comments" | "events" | "live" | "updates";
export type PushPrefs = Record<PushCategory, boolean>;

/** The kinds of notification a person can switch, in the order they are shown. */
export const PUSH_CATEGORIES: { name: PushCategory; label: string; hint: string }[] = [
  { name: "messages", get label() { return t("messages.title"); }, get hint() { return t("labels.whenAFriendMessages"); } },
  { name: "friends", get label() { return t("nav.friends"); }, get hint() { return t("labels.friendRequestsAcceptedRequests"); } },
  { name: "comments", get label() { return t("misc.comments"); }, get hint() { return t("labels.onYourPostsProfile"); } },
  { name: "events", get label() { return t("labels.eventsAndPlans"); }, get hint() { return t("labels.eventsYouHostOr"); } },
  { name: "live", get label() { return t("labels.lives"); }, get hint() { return t("labels.whenAFriendGoes"); } },
  { name: "updates", get label() { return t("labels.everythingElse"); }, get hint() { return t("labels.newBlogEntriesHelp"); } },
];

/** What the browser hands over when it signs up for pushes. */
export interface DeviceSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export const pushApi = {
  /** Whether the site can send them at all, and the public key a device signs up with. */
  key: () => api.get<{ enabled: boolean; publicKey: string | null }>("/push/key"),
  /** How many devices, whether the one at `endpoint` is one of them, and which kinds are on. */
  status: (endpoint?: string) => api.get<{ enabled: boolean; devices: number; thisDevice: boolean; prefs: PushPrefs }>(`/push/status${endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : ""}`),
  subscribe: (subscription: DeviceSubscription) => api.post<{ subscribed: boolean }>("/push/subscribe", { subscription }),
  unsubscribe: (endpoint: string) => api.post<void>("/push/unsubscribe", { endpoint }),
  setPrefs: (changes: Partial<PushPrefs>) => api.patch<{ prefs: PushPrefs }>("/push/preferences", changes),
  test: () => api.post<{ sent: number }>("/push/test"),
};
