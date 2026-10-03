import { api } from "./client";
import type { Comment, Post } from "../types";

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
  feed: () => api.get<{ posts: Post[] }>("/posts/feed"),
  get: (id: string) => api.get<{ post: Post }>(`/posts/${encodeURIComponent(id)}`),
  byUser: (username: string) => api.get<{ posts: Post[] }>(`/posts/user/${username}`),
  create: (input: CreatePostInput) => api.post<{ post: Post }>("/posts", input),
  remove: (id: string) => api.delete<void>(`/posts/${id}`),
  comments: (postId: string) => api.get<{ comments: Comment[] }>(`/posts/${postId}/comments`),
  addComment: (postId: string, content: string) =>
    api.post<{ comment: Comment }>(`/posts/${postId}/comments`, { content }),
  removeComment: (commentId: string) => api.delete<void>(`/comments/${commentId}`),
};
