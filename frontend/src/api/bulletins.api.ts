import { api } from "./client";
import type { Bulletin } from "../types";

export const MAX_BULLETIN_TITLE = 80;
export const MAX_BULLETIN_BODY = 500;

export const bulletinsApi = {
  /** Your friends' bulletins and your own, newest first. */
  list: () => api.get<{ bulletins: Bulletin[] }>("/bulletins"),
  unreadCount: () => api.get<{ unread: number }>("/bulletins/unread-count"),
  /** Marks everything on the board as seen. */
  markSeen: () => api.post<void>("/bulletins/seen"),
  create: (input: { title: string; body: string }) => api.post<{ bulletin: Bulletin }>("/bulletins", input),
  update: (id: string, input: { title?: string; body?: string }) => api.patch<{ bulletin: Bulletin }>(`/bulletins/${encodeURIComponent(id)}`, input),
  remove: (id: string) => api.delete<void>(`/bulletins/${encodeURIComponent(id)}`),
};

// Lets the badge on the feed refresh right after the board is opened, instead of waiting for its next poll.
export const BULLETINS_CHANGED_EVENT = "bulletins:changed";
