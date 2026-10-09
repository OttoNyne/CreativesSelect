import { api } from "./client";
import type { Project, ProjectMessage, ProjectTask } from "../types";

const id = (value: string) => encodeURIComponent(value);

export const projectsApi = {
  /** Your project rooms, the most recently active first. */
  list: () => api.get<{ projects: Project[] }>("/projects"),
  get: (projectId: string) => api.get<{ project: Project }>(`/projects/${id(projectId)}`),
  /** Rename it, or archive it / bring it back (its owner). */
  update: (projectId: string, changes: { title?: string; status?: "active" | "archived" }) => api.patch<{ project: Project }>(`/projects/${id(projectId)}`, changes),
  remove: (projectId: string) => api.delete<void>(`/projects/${id(projectId)}`),
  leave: (projectId: string) => api.post<void>(`/projects/${id(projectId)}/leave`),
  removeMember: (projectId: string, userId: string) => api.delete<void>(`/projects/${id(projectId)}/members/${id(userId)}`),
  /** The newest fifty messages, oldest first; `before` is the id of the oldest one you have. Reading marks the room read. */
  messages: (projectId: string, before?: string) => api.get<{ messages: ProjectMessage[]; hasMore: boolean }>(`/projects/${id(projectId)}/messages${before ? `?before=${id(before)}` : ""}`),
  send: (projectId: string, input: { content?: string; imageUrl?: string }) => api.post<{ message: ProjectMessage }>(`/projects/${id(projectId)}/messages`, input),
  deleteMessage: (projectId: string, messageId: string) => api.delete<void>(`/projects/${id(projectId)}/messages/${id(messageId)}`),
  addTask: (projectId: string, text: string) => api.post<{ task: ProjectTask }>(`/projects/${id(projectId)}/tasks`, { text }),
  setTask: (projectId: string, taskId: string, changes: { done?: boolean; text?: string }) => api.patch<{ task: ProjectTask }>(`/projects/${id(projectId)}/tasks/${id(taskId)}`, changes),
  removeTask: (projectId: string, taskId: string) => api.delete<void>(`/projects/${id(projectId)}/tasks/${id(taskId)}`),
};
