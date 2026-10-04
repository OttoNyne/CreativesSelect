import { api } from "./client";
import type { Group, GroupChatMessage, GroupMember, GroupReply, GroupTopic } from "../types";

export const MAX_GROUP_MESSAGE_LENGTH = 1000;
export const MAX_TOPIC_TITLE = 100;
export const MAX_TOPIC_BODY = 2000;
export const MAX_REPLY_BODY = 1000;

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
  // The group's board (members only): topics with replies.
  topics: (id: string, page = 1) => api.get<{ topics: GroupTopic[]; page: number; hasMore: boolean }>(`/groups/${id}/topics${page > 1 ? `?page=${page}` : ""}`),
  createTopic: (id: string, input: { title: string; body: string }) => api.post<{ topic: GroupTopic }>(`/groups/${id}/topics`, input),
  topic: (id: string, topicId: string, page = 1) =>
    api.get<{ topic: GroupTopic; replies: GroupReply[]; page: number; hasMore: boolean }>(`/groups/${id}/topics/${topicId}${page > 1 ? `?page=${page}` : ""}`),
  deleteTopic: (id: string, topicId: string) => api.delete<void>(`/groups/${id}/topics/${topicId}`),
  reply: (id: string, topicId: string, body: string) => api.post<{ reply: GroupReply }>(`/groups/${id}/topics/${topicId}/replies`, { body }),
  deleteReply: (id: string, topicId: string, replyId: string) => api.delete<void>(`/groups/${id}/topics/${topicId}/replies/${replyId}`),
  pinTopic: (id: string, topicId: string, pinned: boolean) => api.put<{ topic: GroupTopic }>(`/groups/${id}/topics/${topicId}/pin`, { pinned }),
};
