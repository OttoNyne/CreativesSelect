import { api } from "./client";

export type PushCategory = "messages" | "friends" | "comments" | "events" | "live" | "updates";
export type PushPrefs = Record<PushCategory, boolean>;

/** The kinds of notification a person can switch, in the order they are shown. */
export const PUSH_CATEGORIES: { name: PushCategory; label: string; hint: string }[] = [
  { name: "messages", label: "Messages", hint: "When a friend messages you" },
  { name: "friends", label: "Friends", hint: "Friend requests, accepted requests, invites, group invites and birthdays" },
  { name: "comments", label: "Comments", hint: "On your posts, profile, portfolio and blog entries, and emoji reactions to your posts and pictures" },
  { name: "events", label: "Events and plans", hint: "Events you host or answered, and lives you asked to be reminded of" },
  { name: "live", label: "Lives", hint: "When a friend goes live" },
  { name: "updates", label: "Everything else", hint: "New blog entries, Help wanted offers, moderator notices and badges" },
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
