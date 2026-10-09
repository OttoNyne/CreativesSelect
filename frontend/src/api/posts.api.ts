import { api } from "./client";
import type { Comment, Post, ReactionKey, ReactionSummary } from "../types";

export interface CreatePostInput {
  content: string;
  imageUrl?: string | null;
  imageAspect?: "original" | "1:1" | "4:3" | "16:9";
  imageZoom?: number;
  imagePosition?: string;
  isAiText?: boolean;
  isAiImage?: boolean;
}

export const postsApi = {
  /** Twenty at a time, newest first; `before` is the id of the oldest post you have, to get the ones older than it. */
  feed: (before?: string) => api.get<{ posts: Post[]; hasMore?: boolean }>(`/posts/feed${before ? `?before=${encodeURIComponent(before)}` : ""}`),
  get: (id: string) => api.get<{ post: Post }>(`/posts/${encodeURIComponent(id)}`),
  byUser: (username: string) => api.get<{ posts: Post[] }>(`/posts/user/${username}`),
  create: (input: CreatePostInput) => api.post<{ post: Post }>("/posts", input),
  remove: (id: string) => api.delete<void>(`/posts/${id}`),
  /** React with one of the six emoji, change it, or (null) take it away. */
  react: (id: string, emoji: ReactionKey | null) => api.put<{ reactions: ReactionSummary }>(`/posts/${encodeURIComponent(id)}/reaction`, { emoji }),
  /** Share someone else's post to your own feed, with words of your own if you like. */
  repost: (id: string, content?: string) => api.post<{ post: Post }>(`/posts/${encodeURIComponent(id)}/repost`, content ? { content } : {}),
  /** Change the words of your own post. */
  update: (id: string, content: string) => api.patch<{ post: Post }>(`/posts/${encodeURIComponent(id)}`, { content }),
  /** Twenty at a time, oldest first; `after` is the id of the last one you have. */
  comments: (postId: string, after?: string) => api.get<{ comments: Comment[]; hasMore?: boolean }>(`/posts/${postId}/comments${after ? `?after=${encodeURIComponent(after)}` : ""}`),
  updateComment: (commentId: string, content: string) => api.patch<{ comment: Comment }>(`/comments/${encodeURIComponent(commentId)}`, { content }),
  addComment: (postId: string, content: string, imageUrl?: string) =>
    api.post<{ comment: Comment }>(`/posts/${postId}/comments`, { content, ...(imageUrl ? { imageUrl } : {}) }),
  /** Take the picture off your comment (the words stay). */
  removeCommentPicture: (commentId: string) => api.patch<{ comment: Comment }>(`/comments/${encodeURIComponent(commentId)}`, { imageUrl: null }),
  removeComment: (commentId: string) => api.delete<void>(`/comments/${commentId}`),
};
