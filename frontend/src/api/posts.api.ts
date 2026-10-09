import { api } from "./client";
import type { Comment, Post, PostPoll, ReactionKey, ReactionSummary } from "../types";

export interface CreatePostInput {
  content: string;
  imageUrl?: string | null;
  imageAspect?: "original" | "1:1" | "4:3" | "16:9";
  imageZoom?: number;
  imagePosition?: string;
  /** What the picture shows, for people who can't see it (up to 300 characters). */
  imageAlt?: string;
  /** A poll to ask: two to four options, open for 1, 3 or 7 days. */
  poll?: { options: string[]; days: 1 | 3 | 7 };
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
  /** Vote in a post's poll (final): `option` is the place of the option in its list. Answers with how the poll stands. */
  vote: (id: string, option: number) => api.put<{ poll: PostPoll }>(`/posts/${encodeURIComponent(id)}/poll/vote`, { option }),
  /** Put your own post at the top of your profile (replacing the one pinned now), or take it down. */
  pin: (id: string) => api.put<{ pinned: boolean }>(`/posts/${encodeURIComponent(id)}/pin`, {}),
  unpin: (id: string) => api.delete<void>(`/posts/${encodeURIComponent(id)}/pin`),
  /** Add, change or (empty) remove the description of your own post's picture. */
  setPictureDescription: (id: string, imageAlt: string) => api.patch<{ post: Post }>(`/posts/${encodeURIComponent(id)}`, { imageAlt }),
  /** Change the words of your own post. */
  update: (id: string, content: string) => api.patch<{ post: Post }>(`/posts/${encodeURIComponent(id)}`, { content }),
  /** Twenty at a time, oldest first; `after` is the id of the last one you have. */
  comments: (postId: string, after?: string) => api.get<{ comments: Comment[]; hasMore?: boolean }>(`/posts/${postId}/comments${after ? `?after=${encodeURIComponent(after)}` : ""}`),
  updateComment: (commentId: string, content: string) => api.patch<{ comment: Comment }>(`/comments/${encodeURIComponent(commentId)}`, { content }),
  addComment: (postId: string, content: string, imageUrl?: string, parent?: string) =>
    api.post<{ comment: Comment }>(`/posts/${postId}/comments`, { content, ...(imageUrl ? { imageUrl } : {}), ...(parent ? { parent } : {}) }),
  /** Take the picture off your comment (the words stay). */
  removeCommentPicture: (commentId: string) => api.patch<{ comment: Comment }>(`/comments/${encodeURIComponent(commentId)}`, { imageUrl: null }),
  removeComment: (commentId: string) => api.delete<void>(`/comments/${commentId}`),
};
