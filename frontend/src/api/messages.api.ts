import { api } from "./client";
import type { Conversation, DirectMessage, User } from "../types";

export const MAX_MESSAGE_LENGTH = 2000;

export const messagesApi = {
  conversations: () => api.get<{ conversations: Conversation[] }>("/messages/conversations"),
  unreadCount: () => api.get<{ unread: number }>("/messages/unread-count"),
  thread: (username: string, before?: string) =>
    api.get<{ user: User; messages: DirectMessage[]; hasMore: boolean }>(
      `/messages/with/${encodeURIComponent(username)}${before ? `?before=${encodeURIComponent(before)}` : ""}`
    ),
  send: (username: string, body: string) =>
    api.post<{ message: DirectMessage }>(`/messages/with/${encodeURIComponent(username)}`, { body }),
  remove: (id: string) => api.delete<void>(`/messages/${id}`),
};

// Lets the nav badge and conversation list refresh right after a thread is
// opened or a message is sent, instead of waiting for their next poll.
export const MESSAGES_CHANGED_EVENT = "messages:changed";
export function announceMessagesChanged() {
  window.dispatchEvent(new Event(MESSAGES_CHANGED_EVENT));
}
