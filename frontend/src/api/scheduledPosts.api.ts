import { api } from "./client";
import type { Post, ScheduledPost } from "../types";
import type { CreatePostInput } from "./posts.api";

export interface ScheduleInput extends CreatePostInput {
  /** When to publish it: an ISO date-time at least a minute away and at most 90 days. */
  publishAt: string;
}

export const scheduledPostsApi = {
  /** Yours, in the order they will go out. */
  list: () => api.get<{ posts: ScheduledPost[] }>("/scheduled-posts"),
  create: (input: ScheduleInput) => api.post<{ post: ScheduledPost }>("/scheduled-posts", input),
  /** Change the words, the picture's description or the time (a new time also gives a failed one another try). */
  update: (id: string, changes: { content?: string; imageAlt?: string; publishAt?: string }) => api.patch<{ post: ScheduledPost }>(`/scheduled-posts/${encodeURIComponent(id)}`, changes),
  /** Publish it now; answers with the post. */
  publishNow: (id: string) => api.post<{ post: Post }>(`/scheduled-posts/${encodeURIComponent(id)}/publish`, {}),
  remove: (id: string) => api.delete<void>(`/scheduled-posts/${encodeURIComponent(id)}`),
};
