import { api } from "./client";
import type { BoardTask, Task } from "../types";

export const tasksApi = {
  list: () => api.get<Task[]>("/tasks"),
  get: (id: string) => api.get<Task>(`/tasks/${id}`),
  create: (body: {
    title: string;
    description?: string;
    isPublic?: boolean;
    priority?: string;
    dueDate?: string;
  }) => api.post<Task>("/tasks", body),
  update: (id: string, body: Partial<Task>) => api.put<Task>(`/tasks/${id}`, body),
  remove: (id: string) => api.delete<{ message: string }>(`/tasks/${id}`),
  board: () => api.get<{ tasks: BoardTask[] }>("/tasks/board"),
  offerHelp: (id: string, message?: string) =>
    api.post<{ message: string }>(`/tasks/${id}/offer`, message ? { message } : {}),
};
