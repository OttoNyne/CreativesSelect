import { api } from "./client";

export const topicsApi = {
  /** The topics (hashtags) you follow, most recently followed first. */
  list: () => api.get<{ topics: string[] }>("/topics"),
  follow: (tag: string) => api.put<{ following: true }>(`/topics/${encodeURIComponent(tag)}`, {}),
  unfollow: (tag: string) => api.delete<void>(`/topics/${encodeURIComponent(tag)}`),
};

export const digestApi = {
  /** Whether you get the weekly summary email, and whether your address is confirmed (summaries only go to confirmed ones). */
  get: () => api.get<{ enabled: boolean; emailVerified: boolean }>("/digest"),
  set: (enabled: boolean) => api.put<{ enabled: boolean; emailVerified: boolean }>("/digest", { enabled }),
  /** The link in the email: turns it off with the token from the address, without signing in. */
  unsubscribe: (token: string) => api.post<{ enabled: false }>("/digest/unsubscribe", { token }),
};
