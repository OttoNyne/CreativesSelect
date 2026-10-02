import { api } from "./client";
import type { Group, GroupChatMessage, GroupMember } from "../types";

export const MAX_GROUP_MESSAGE_LENGTH = 1000;

export interface CreateGroupInput {
  name: string;
  description?: string;
  bannerUrl?: string | null;
}

export const groupsApi = {
  list: (search?: string) => api.get<{ groups: Group[] }>(`/groups${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  get: (id: string) => api.get<{ group: Group }>(`/groups/${id}`),
  create: (input: CreateGroupInput) => api.post<{ group: Group }>("/groups", input),
  join: (id: string) => api.post<void>(`/groups/${id}/join`),
  leave: (id: string) => api.post<void>(`/groups/${id}/leave`),
  members: (id: string) => api.get<{ members: GroupMember[] }>(`/groups/${id}/members`),
  messages: (id: string, before?: string) =>
    api.get<{ messages: GroupChatMessage[]; hasMore: boolean }>(
      `/groups/${id}/messages${before ? `?before=${encodeURIComponent(before)}` : ""}`
    ),
  sendMessage: (id: string, body: string) => api.post<{ message: GroupChatMessage }>(`/groups/${id}/messages`, { body }),
  deleteMessage: (id: string, messageId: string) => api.delete<void>(`/groups/${id}/messages/${messageId}`),
};
