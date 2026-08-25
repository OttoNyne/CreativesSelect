import { api } from "./client";
import type { Group, GroupMember } from "../types";

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
};
