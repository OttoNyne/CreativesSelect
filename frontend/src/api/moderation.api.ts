import { api } from "./client";

export const moderationApi = {
  block: (username: string) => api.post<void>(`/users/${username}/block`),
  unblock: (username: string) => api.delete<void>(`/users/${username}/block`),
  report: (targetType: "user" | "post" | "comment" | "profileComment", targetId: string, reason: string) =>
    api.post<{ report: unknown }>("/reports", { targetType, targetId, reason }),
};
