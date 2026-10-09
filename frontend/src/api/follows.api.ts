import { api } from "./client";

export interface FollowPerson {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  csVerified: boolean;
}

export const followsApi = {
  /** Follow someone with a public profile: their posts show in your feed. */
  follow: (username: string) => api.post<{ following: true }>(`/follows/${encodeURIComponent(username)}`),
  /** Stop following. */
  unfollow: (username: string) => api.delete<void>(`/follows/${encodeURIComponent(username)}`),
  /** The people you follow, thirty a page. */
  following: (page = 1) => api.get<{ people: FollowPerson[]; page: number; hasMore: boolean }>(`/follows/following${page > 1 ? `?page=${page}` : ""}`),
  /** The people who follow you, thirty a page. */
  followers: (page = 1) => api.get<{ people: FollowPerson[]; page: number; hasMore: boolean }>(`/follows/followers${page > 1 ? `?page=${page}` : ""}`),
};
