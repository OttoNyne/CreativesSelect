import { api, postForFile } from "./client";
import type { Comment, ProfileTheme, User, WallpaperMotion } from "../types";
import type { SectionKey } from "../lib/sections";

export interface UpdateProfileInput {
  displayName?: string;
  bio?: string;
  avatarUrl?: string | null;
  wallpaperUrl?: string | null;
  wallpaperType?: "image" | "video";
  wallpaperPosition?: string;
  wallpaperMotion?: WallpaperMotion;
  mood?: string;
  listeningTo?: string;
  tags?: string[];
  sectionOrder?: SectionKey[];
  hiddenSections?: SectionKey[];
  showActivity?: boolean;
  profileViews?: boolean;
  showConnections?: boolean;
  chatStatus?: boolean;
  isPrivate?: boolean;
  theme?: ProfileTheme;
}

export const profilesApi = {
  /** Everything the person has written or chosen, as a file to save. Asks for the password again. */
  exportData: (password: string) => postForFile("/profiles/me/export", { password }),
  /** New public profiles, newest first, optionally only those with a tag. */
  discover: ({ tag, page }: { tag?: string; page?: number } = {}) => {
    const query = new URLSearchParams();
    if (tag) query.set("tag", tag);
    if (page && page > 1) query.set("page", String(page));
    const qs = query.toString();
    return api.get<{ users: User[]; page: number; hasMore: boolean }>(`/profiles/discover${qs ? `?${qs}` : ""}`);
  },
  /** The tags people use, most used first; `q` narrows them to those starting with it. */
  tags: (q?: string) => api.get<{ tags: { tag: string; count: number }[] }>(`/profiles/tags${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  get: (username: string) => api.get<{ user: User }>(`/profiles/${username}`),
  changeUsername: (username: string) => api.put<{ user: User }>("/profiles/me/username", { username }),
  deleteMe: (password: string) => api.delete<void>("/profiles/me", { password }),
  updateMe: (input: UpdateProfileInput) => api.patch<{ user: User }>("/profiles/me", input),
  getTopFriends: (username: string) => api.get<{ topFriends: User[] }>(`/profiles/${username}/top-friends`),
  setTopFriends: (usernames: string[]) =>
    api.put<{ topFriends: User[] }>("/profiles/me/top-friends", { usernames }),
  /** Newest first, twenty at a time; `before` is the id of the oldest you have. */
  getComments: (username: string, before?: string) => api.get<{ comments: Comment[]; hasMore?: boolean }>(`/profiles/${username}/comments${before ? `?before=${encodeURIComponent(before)}` : ""}`),
  updateComment: (commentId: string, content: string) => api.patch<{ comment: Comment }>(`/profiles/comments/${encodeURIComponent(commentId)}`, { content }),
  addComment: (username: string, content: string, imageUrl?: string) =>
    api.post<{ comment: Comment }>(`/profiles/${username}/comments`, { content, ...(imageUrl ? { imageUrl } : {}) }),
  /** Take the picture off your testimonial (the words stay). */
  removeCommentPicture: (commentId: string) => api.patch<{ comment: Comment }>(`/profiles/comments/${encodeURIComponent(commentId)}`, { imageUrl: null }),
  deleteComment: (commentId: string) => api.delete<void>(`/profiles/comments/${commentId}`),
};
