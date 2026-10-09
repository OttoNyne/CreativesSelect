import { api } from "./client";

/** What can be reported to the moderators. */
export type ReportTarget = "user" | "post" | "comment" | "profileComment" | "blogEntry" | "bulletin" | "groupTopic" | "groupReply" | "mediaComment" | "event" | "blogComment" | "piece" | "processStep" | "call" | "callApplication" | "projectMessage" | "critique" | "critiqueNote";

export const moderationApi = {
  block: (username: string) => api.post<void>(`/users/${username}/block`),
  unblock: (username: string) => api.delete<void>(`/users/${username}/block`),
  report: (targetType: ReportTarget, targetId: string, reason: string) =>
    api.post<{ report: unknown }>("/reports", { targetType, targetId, reason }),
};
