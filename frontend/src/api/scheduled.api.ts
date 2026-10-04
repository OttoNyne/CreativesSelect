import { api } from "./client";
import type { ScheduledLive } from "../types";

export const MAX_SCHEDULED_TITLE_LENGTH = 80;

export const scheduledApi = {
  /** Lives people have planned that you can see, soonest first. */
  list: () => api.get<{ scheduled: ScheduledLive[] }>("/scheduled-lives"),
  create: (title: string, startsAt: string) => api.post<{ scheduled: ScheduledLive }>("/scheduled-lives", { title, startsAt }),
  cancel: (id: string) => api.delete<void>(`/scheduled-lives/${id}`),
  remind: (id: string) => api.post<{ reminding: boolean; reminderCount: number }>(`/scheduled-lives/${id}/remind`),
  unremind: (id: string) => api.delete<{ reminding: boolean; reminderCount: number }>(`/scheduled-lives/${id}/remind`),
};
