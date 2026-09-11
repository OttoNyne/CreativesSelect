import { api } from "./client";
import type { Task } from "../types";

export const tasksApi = {
  list: () => api.get<Task[]>("/tasks"),
  get: (id: string) => api.get<Task>(`/tasks/${id}`),
  create: (body: { title: string; done?: boolean; priority?: string; dueDate?: string }) =>
    api.post<Task>("/tasks", body),
  update: (id: string, body: Partial<Task>) => api.put<Task>(`/tasks/${id}`, body),
  remove: (id: string) => api.delete<{ message: string }>(`/tasks/${id}`),
};
