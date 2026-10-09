import { api, ApiError } from "./client";
import type { Comment, MediaItem, ReactionKey, ReactionSummary } from "../types";

import { API_BASE } from "./base";
import { t } from "../i18n";

const API_URL = API_BASE;

export type UploadPurpose = "avatars" | "wallpapers" | "portfolio" | "tracks" | "comments";

export async function uploadFile(
  file: File,
  purpose: UploadPurpose,
  /** A portfolio piece can be given its caption as it is added. */
  caption?: string,
): Promise<{ url: string; mediaItem?: MediaItem }> {
  const formData = new FormData();
  // the caption goes first: the server reads the fields that come before the file
  if (caption) formData.append("caption", caption);
  formData.append("file", file);

  const res = await fetch(`${API_URL}/api/media/upload?purpose=${purpose}`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  const data = await res.json().catch(() => undefined);
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? t("libmsg.uploadFailed"));
  }
  return data;
}

export interface CreateMediaItemInput {
  url: string;
  type?: "image" | "video";
  caption?: string;
  isAiImage?: boolean;
  /** Video links: where the one-minute window starts. */
  startSeconds?: number;
}

export const mediaApi = {
  byUser: (username: string) => api.get<{ media: MediaItem[] }>(`/media/user/${username}`),
  create: (input: CreateMediaItemInput) => api.post<{ mediaItem: MediaItem }>("/media", input),
  remove: (id: string) => api.delete<void>(`/media/${id}`),
  /** Put your own piece first in your portfolio (replacing the one featured now), or take it off. */
  feature: (id: string) => api.put<{ featured: boolean }>(`/media/${encodeURIComponent(id)}/feature`, {}),
  unfeature: (id: string) => api.delete<void>(`/media/${encodeURIComponent(id)}/feature`),
  /** Give a piece a caption, change it, or (null, or only spaces) take it off. */
  setCaption: (id: string, caption: string | null) => api.patch<{ item: MediaItem }>(`/media/${id}`, { caption }),
  /** Put a piece in one of your albums, or (null) take it out of its album. */
  setAlbum: (id: string, album: string | null) => api.patch<{ item: MediaItem }>(`/media/${id}`, { album }),
  /** React with one of the six emoji, change it, or (null) take it away. */
  react: (id: string, emoji: ReactionKey | null) => api.put<{ reactions: ReactionSummary }>(`/media/${id}/reaction`, { emoji }),
  /** Comments on a piece, oldest first, a page at a time (`after` is the last comment you have). */
  comments: (id: string, after?: string) => api.get<{ comments: Comment[]; hasMore?: boolean }>(`/media/${id}/comments${after ? `?after=${encodeURIComponent(after)}` : ""}`),
  addComment: (id: string, content: string, imageUrl?: string, parent?: string) => api.post<{ comment: Comment }>(`/media/${id}/comments`, { content, ...(imageUrl ? { imageUrl } : {}), ...(parent ? { parent } : {}) }),
  /** Take the picture off your comment (the words stay). */
  removeCommentPicture: (commentId: string) => api.patch<{ comment: Comment }>(`/media/comments/${encodeURIComponent(commentId)}`, { imageUrl: null }),
  updateComment: (commentId: string, content: string) => api.patch<{ comment: Comment }>(`/media/comments/${encodeURIComponent(commentId)}`, { content }),
  removeComment: (commentId: string) => api.delete<void>(`/media/comments/${encodeURIComponent(commentId)}`),
};
