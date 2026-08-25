import { api } from "./client";
import type { Comment, ProfileTheme, User } from "../types";

export interface UpdateProfileInput {
  displayName?: string;
  bio?: string;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  profileSongUrl?: string | null;
  isPrivate?: boolean;
  theme?: ProfileTheme;
}

export const profilesApi = {
  search: (query: string) => api.get<{ users: User[] }>(`/profiles?search=${encodeURIComponent(query)}`),
  get: (username: string) => api.get<{ user: User }>(`/profiles/${username}`),
  updateMe: (input: UpdateProfileInput) => api.patch<{ user: User }>("/profiles/me", input),
  getTopFriends: (username: string) => api.get<{ topFriends: User[] }>(`/profiles/${username}/top-friends`),
  setTopFriends: (usernames: string[]) =>
    api.put<{ topFriends: User[] }>("/profiles/me/top-friends", { usernames }),
  getComments: (username: string) => api.get<{ comments: Comment[] }>(`/profiles/${username}/comments`),
  addComment: (username: string, content: string) =>
    api.post<{ comment: Comment }>(`/profiles/${username}/comments`, { content }),
  deleteComment: (commentId: string) => api.delete<void>(`/profiles/comments/${commentId}`),
};
