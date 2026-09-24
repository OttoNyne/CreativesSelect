import { api } from "./client";
import type { Notification } from "../types";

export const notificationsApi = {
  list: () => api.get<{ notifications: Notification[] }>("/notifications"),
  markRead: (id: string) => api.post<void>(`/notifications/${id}/read`),
  acceptOffer: (id: string) => api.post<{ message: string }>(`/notifications/${id}/accept-offer`),
  markAllRead: () => api.post<void>("/notifications/read-all"),
};
