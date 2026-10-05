import { api } from "./client";
import type { BlogEntry, BlogSummary, Comment } from "../types";

export interface BlogInput {
  title: string;
  body: string;
}

export const blogApi = {
  /** Someone's entries, newest first, ten a page. */
  byUser: (username: string, page = 1) =>
    api.get<{ entries: BlogSummary[]; page: number; hasMore: boolean }>(`/blog/user/${encodeURIComponent(username)}${page > 1 ? `?page=${page}` : ""}`),
  get: (id: string) => api.get<{ entry: BlogEntry }>(`/blog/${encodeURIComponent(id)}`),
  create: (input: BlogInput) => api.post<{ entry: BlogEntry }>("/blog", input),
  update: (id: string, input: Partial<BlogInput>) => api.put<{ entry: BlogEntry }>(`/blog/${encodeURIComponent(id)}`, input),
  remove: (id: string) => api.delete<void>(`/blog/${encodeURIComponent(id)}`),
  /** Comments on an entry, oldest first, a page at a time (`after` is the last comment you have). */
  comments: (id: string, after?: string) => api.get<{ comments: Comment[]; hasMore?: boolean }>(`/blog/${encodeURIComponent(id)}/comments${after ? `?after=${encodeURIComponent(after)}` : ""}`),
  addComment: (id: string, content: string, imageUrl?: string) => api.post<{ comment: Comment }>(`/blog/${encodeURIComponent(id)}/comments`, { content, ...(imageUrl ? { imageUrl } : {}) }),
  updateComment: (commentId: string, content: string) => api.patch<{ comment: Comment }>(`/blog/comments/${encodeURIComponent(commentId)}`, { content }),
  /** Take the picture off your comment (the words stay). */
  removeCommentPicture: (commentId: string) => api.patch<{ comment: Comment }>(`/blog/comments/${encodeURIComponent(commentId)}`, { imageUrl: null }),
  removeComment: (commentId: string) => api.delete<void>(`/blog/comments/${encodeURIComponent(commentId)}`),
};

export const MAX_BLOG_TITLE = 120;
export const MAX_BLOG_BODY = 10000;
