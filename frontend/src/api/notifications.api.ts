import { api } from "./client";
import type { Notification } from "../types";

export const notificationsApi = {
  /** Thirty at a time, newest first; `before` is the id of the oldest you have. */
  list: (before?: string) => api.get<{ notifications: Notification[]; hasMore?: boolean }>(`/notifications${before ? `?before=${encodeURIComponent(before)}` : ""}`),
  markRead: (id: string) => api.post<void>(`/notifications/${id}/read`),
  acceptOffer: (id: string) => api.post<{ message: string }>(`/notifications/${id}/accept-offer`),
  markAllRead: () => api.post<void>("/notifications/read-all"),
};
