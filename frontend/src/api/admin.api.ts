import { api } from "./client";
import type { AdminAction, ModerationCase, SuspendedAccount } from "../types";

export type ModerationDecision = "dismiss" | "remove" | "suspend" | "remove_and_suspend";
export const MAX_NOTE = 500;

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
};
