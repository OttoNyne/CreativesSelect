import { api } from "./client";
import type { WorkRequest } from "../types";

export const MAX_TITLE = 80;
export const MAX_DETAILS = 1000;
export const MAX_BUDGET = 40;
export const MAX_REPLY = 500;
export const MAX_OFFERS = 5;
export const MAX_WORK_NOTE = 140;

export interface WorkRequestInput {
  title: string;
  details: string;
  budget?: string;
  /** A day, like 2026-12-31. */
  deadline?: string;
}

export const workRequestsApi = {
  /** Ask someone who is open to work. */
  send: (username: string, input: WorkRequestInput) => api.post<{ request: WorkRequest }>(`/work-requests/to/${encodeURIComponent(username)}`, input),
  /** What people have asked of you, waiting ones first. */
  received: () => api.get<{ requests: WorkRequest[] }>("/work-requests/received"),
  /** What you have asked of others, and how they answered. */
  sent: () => api.get<{ requests: WorkRequest[] }>("/work-requests/sent"),
  /** Say yes or no to one that is waiting for you, with a short note the asker sees. */
  answer: (id: string, accept: boolean, reply?: string) => api.post<{ request: Pick<WorkRequest, "id" | "status" | "reply" | "answeredAt"> }>(`/work-requests/${encodeURIComponent(id)}/answer`, { accept, ...(reply ? { reply } : {}) }),
  /** Withdraw one that is still waiting (the asker), or clear one you have answered (the person asked). */
  remove: (id: string) => api.delete<void>(`/work-requests/${encodeURIComponent(id)}`),
};
