import { api } from "./client";
import type { BlogEntry, BlogSummary } from "../types";

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
};

export const MAX_BLOG_TITLE = 120;
export const MAX_BLOG_BODY = 10000;
