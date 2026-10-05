import { api } from "./client";
import type { AdminAction, ModerationCase, SuspendedAccount, User } from "../types";

export type ModerationDecision = "dismiss" | "remove" | "suspend" | "remove_and_suspend";
export const MAX_NOTE = 500;

/** Someone an administrator gave the CSverified badge to, and when. */
export interface VerifiedPerson {
  user: User;
  givenAt: string;
}

// The moderation review queue: only administrators can use any of this (everyone else gets a 404).
export const adminApi = {
  /** Open reports, grouped by what was reported, most recent first. */
  reports: (page = 1) => api.get<{ cases: ModerationCase[]; page: number; hasMore: boolean }>(`/admin/reports${page > 1 ? `?page=${page}` : ""}`),
  /** A decision on everything reported about one thing. */
  resolve: (targetType: string, targetId: string, action: ModerationDecision, note?: string) =>
    api.post<{ outcome: string; removed: boolean }>("/admin/reports/resolve", { targetType, targetId, action, ...(note ? { note } : {}) }),
  actions: (page = 1) => api.get<{ actions: AdminAction[]; page: number; hasMore: boolean }>(`/admin/actions${page > 1 ? `?page=${page}` : ""}`),
  suspended: (page = 1) => api.get<{ users: SuspendedAccount[]; page: number; hasMore: boolean }>(`/admin/suspended${page > 1 ? `?page=${page}` : ""}`),
  unsuspend: (userId: string) => api.post<void>(`/admin/users/${encodeURIComponent(userId)}/unsuspend`),
  /** The people an administrator has given the CSverified badge to, newest first. */
  verified: (page = 1) => api.get<{ users: VerifiedPerson[]; page: number; hasMore: boolean }>(`/admin/verified${page > 1 ? `?page=${page}` : ""}`),
  /** Give someone the badge (giving it again changes nothing). */
  giveBadge: (username: string) => api.put<{ user: User; given: boolean }>(`/admin/verified/${encodeURIComponent(username)}`),
  /** Take the badge an administrator gave away (a badge earned with friends is not touched). */
  removeBadge: (username: string) => api.delete<void>(`/admin/verified/${encodeURIComponent(username)}`),
};
