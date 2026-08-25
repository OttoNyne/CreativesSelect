import { api } from "./client";
import type { Notification } from "../types";

export const notificationsApi = {
  list: () => api.get<{ notifications: Notification[] }>("/notifications"),
  markRead: (id: string) => api.post<void>(`/notifications/${id}/read`),
};
